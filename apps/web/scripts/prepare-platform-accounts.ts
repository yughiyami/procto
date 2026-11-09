/**
 * One-off: gives the PROCTO treasury and impact-fund accounts a PUSD trustline (fees sponsored by the
 * deployed /api/sponsor). Secrets are read from stellar-cli at runtime and kept in memory only.
 *
 *   pnpm --filter @izumi/web exec tsx scripts/prepare-platform-accounts.ts
 */
import { execFileSync } from 'node:child_process';
import { enableToken, getBalances, httpSponsorSubmitter } from '../src/stellar/chain';
import { PLATFORM_ACCOUNTS } from '../src/stellar/platform';
import { keypairSigner } from '../src/stellar/signer';

const cli = process.env.STELLAR_CLI ?? 'stellar';
const sponsor = httpSponsorSubmitter(process.env.SPONSOR_URL ?? 'https://procto-lovat.vercel.app/api/sponsor');

for (const [alias, address] of [
  ['procto-treasury', PLATFORM_ACCOUNTS.treasury],
  ['procto-impact', PLATFORM_ACCOUNTS.impact],
] as const) {
  const secret = execFileSync(cli, ['keys', 'secret', alias], { encoding: 'utf8' }).trim();
  const signer = keypairSigner(secret);
  if (signer.address !== address) throw new Error(`${alias} does not match the configured public key`);
  const outcome = await enableToken(signer, 'PUSD', { sponsor });
  const balances = await getBalances(address);
  console.log(alias, outcome ? `trustline added (tx ${outcome.hash})` : 'already prepared', 'PUSD:', balances.PUSD);
}
