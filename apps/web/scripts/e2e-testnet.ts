/**
 * End-to-end proof on Stellar testnet. Exercises the SAME modules the UI uses
 * (src/stellar/chain.ts, mapping, units, factoring) plus the fee-sponsorship core
 * (api/_lib/sponsor.ts) and the demo faucet (api/_lib/faucet.ts).
 *
 * Keys: demo identities are read from stellar-cli at runtime (`stellar keys secret
 * <alias>`) and live only in memory. Sponsor/issuer secrets come from
 * apps/web/.env.local (gitignored). Nothing secret is written to disk or printed.
 *
 *   pnpm --filter @izumi/web e2e
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';
import { mintDemoTokens } from '../api/_lib/faucet';
import { sponsorAndSubmit } from '../api/_lib/sponsor';
import {
  buyShare,
  confirmDelivery,
  createChainOrder,
  fundChainOrder,
  getBalances,
  getChainOrder,
  getOrderEvents,
  httpSponsorSubmitter,
  markDelivered,
  offerShare,
  prepareAccount,
  type Submitter,
} from '../src/stellar/chain';
import { explorerTx, shortAddress } from '../src/stellar/config';
import { advanceQuote, daysUntil, suggestAdvancePrice } from '../src/stellar/factoring';
import { keypairSigner } from '../src/stellar/signer';
import { penCentsToTokenUnits, formatToken } from '../src/stellar/units';

const here = dirname(fileURLToPath(import.meta.url));
const env: Record<string, string> = {};
for (const line of readFileSync(join(here, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]!] = m[2]!;
}
process.env.PATH = `${process.env.PATH ?? ''};${process.env.USERPROFILE ?? ''}\\.cargo\\bin;/c/Users/marro/.cargo/bin`;

const secretOf = (alias: string) => execFileSync('stellar', ['keys', 'secret', alias], { encoding: 'utf8' }).trim();
const signerOf = (alias: string) => keypairSigner(secretOf(alias));

// Fee sponsorship. By default it runs in-process with the very same code the Vercel
// function runs; set E2E_BASE_URL (e.g. https://procto-lovat.vercel.app) to go through
// the deployed /api/sponsor endpoint instead.
const baseUrl = process.env.E2E_BASE_URL?.replace(/\/$/, '');
const sponsor: Submitter = baseUrl
  ? httpSponsorSubmitter(`${baseUrl}/api/sponsor`)
  : (xdr) => sponsorAndSubmit(xdr, { SPONSOR_SECRET: env.SPONSOR_SECRET });
if (baseUrl) console.log(`Using deployed sponsor endpoint: ${baseUrl}/api/sponsor`);
const hashes: Array<[string, string, boolean]> = [];
const log = (label: string, outcome: { hash: string; sponsored: boolean }) => {
  hashes.push([label, outcome.hash, outcome.sponsored]);
  console.log(`  ${label.padEnd(28)} sponsored=${outcome.sponsored}  ${explorerTx(outcome.hash)}`);
};
const opts = { sponsor, onFallback: (m: string) => console.log('  FALLBACK:', m) };

async function main() {
  console.log('== 1. Brand-new account onboarding (no XLM ever needed by the user)');
  const fresh = keypairSigner(Keypair.random().secret());
  await prepareAccount(fresh, (s) => console.log(`  step: ${s}`), opts);
  const minted = await mintDemoTokens(fresh.address, { ISSUER_SECRET: env.ISSUER_SECRET });
  console.log(`  new account ${shortAddress(fresh.address)} got ${minted.amount} PUSD  ${explorerTx(minted.hash)}`);
  console.log('  balances:', await getBalances(fresh.address));

  console.log('== 2. Protected payment: buyer / two workshops / coordinator / investor');
  const buyer = signerOf('procto-buyer');
  const a = signerOf('procto-supplier-a');
  const b = signerOf('procto-supplier-b');
  const coordinator = signerOf('procto-coordinator');
  const investor = signerOf('procto-investor');

  // Shares derived the same way the UI derives them from an accepted quote (S/ PEN cents -> token units).
  const shares = [
    { supplier: a.address, label: 'Taller de tejido Colca', amount: penCentsToTokenUnits(1_125_000) },
    { supplier: b.address, label: 'Taller de bordado Misti', amount: penCentsToTokenUnits(750_000) },
    { supplier: coordinator.address, label: 'Coordinación y producción propia', amount: penCentsToTokenUnits(375_000) },
  ];
  const total = shares.reduce((t, s) => t + s.amount, 0n);
  console.log(`  total ${formatToken(total)} PUSD`);

  const before = await Promise.all([buyer, a, b, coordinator, investor].map((s) => getBalances(s.address)));
  if ((before[0]!.PUSD ?? 0) < Number(total) / 1e7) {
    const m = await mintDemoTokens(buyer.address, { ISSUER_SECRET: env.ISSUER_SECRET });
    console.log(`  topped up buyer ${m.amount} PUSD  ${explorerTx(m.hash)}`);
  }
  if ((before[4]!.PUSD ?? 0) < 400) {
    const m = await mintDemoTokens(investor.address, { ISSUER_SECRET: env.ISSUER_SECRET });
    console.log(`  topped up investor ${m.amount} PUSD  ${explorerTx(m.hash)}`);
  }
  const startBalances = await Promise.all([buyer, a, b, coordinator, investor].map((s) => getBalances(s.address)));

  const deadline = Math.floor(Date.now() / 1000) + 14 * 86400;
  const created = await createChainOrder(buyer, { token: 'PUSD', shares, deadline }, opts);
  log('create_order', created);
  console.log(`  chain order id = ${created.orderId}`);
  log('fund (buyer deposits)', await fundChainOrder(buyer, created.orderId, opts));
  log('mark_delivered (workshop A)', await markDelivered(a, created.orderId, 0, opts));

  const price = suggestAdvancePrice(shares[1]!.amount);
  const q = advanceQuote({ amount: shares[1]!.amount, price, days: daysUntil(deadline) });
  console.log(`  workshop B offers its claim at ${formatToken(price)} (discount ${q.discountPct.toFixed(1)}%, investor ~${(q.annualRate * 100).toFixed(0)}% annualised)`);
  log('offer_share (workshop B)', await offerShare(b, created.orderId, 1, price, opts));
  log('buy_share (investor)', await buyShare(investor, created.orderId, 1, opts));

  for (let i = 0; i < 3; i++) log(`confirm_delivery #${i}`, await confirmDelivery(buyer, created.orderId, i, opts));

  const final = await getChainOrder(created.orderId);
  console.log(`  final status: ${final?.status.tag}, released ${formatToken(final?.released ?? 0n)} of ${formatToken(final?.total ?? 0n)}`);
  const end = await Promise.all([buyer, a, b, coordinator, investor].map((s) => getBalances(s.address)));
  const names = ['buyer', 'workshop A', 'workshop B', 'coordinator', 'investor'];
  names.forEach((n, i) => {
    const delta = (end[i]!.PUSD ?? 0) - (startBalances[i]!.PUSD ?? 0);
    console.log(`  ${n.padEnd(12)} PUSD ${String(end[i]!.PUSD).padStart(14)}  (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`);
  });

  const events = await getOrderEvents(created.orderId);
  console.log(`  contract events found for this order: ${events.length} (${events.map((e) => e.kind).join(', ')})`);
  if (final?.status.tag !== 'Completed') throw new Error('order did not complete');
  if (hashes.some(([, , s]) => !s)) throw new Error('some transactions were not sponsored');
  console.log('\nE2E OK. Every transaction was fee-sponsored (users paid no network fee).');
}

main().catch((error) => {
  console.error('E2E FAILED:', error instanceof Error ? error.message : error);
  if (error instanceof Error && 'cause' in error && error.cause) console.error('cause:', (error.cause as Error).message ?? error.cause);
  process.exit(1);
});
