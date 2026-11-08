import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { CONTRACT_ID, TOKENS } from '../../src/stellar/config.js';
import { SponsorError, buildSponsoredEnvelope, inspectInnerTransaction, checkRateLimit } from './sponsor.js';

const PASS = Networks.TESTNET;
const user = Keypair.random();

function invoke(contract: string, fn: string, source = user, sign = true) {
  const tx = new TransactionBuilder(new Account(source.publicKey(), '100'), { fee: '200000', networkPassphrase: PASS })
    .addOperation(Operation.invokeContractFunction({ contract, function: fn, args: [nativeToScVal(1, { type: 'u64' })] }))
    .setTimeout(120)
    .build();
  if (sign) tx.sign(source);
  return tx;
}

function trust(asset: Asset, sign = true) {
  const tx = new TransactionBuilder(new Account(user.publicKey(), '100'), { fee: '100', networkPassphrase: PASS })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(120)
    .build();
  if (sign) tx.sign(user);
  return tx;
}

describe('inspectInnerTransaction', () => {
  it('accepts a signed call to our contract', () => {
    const info = inspectInnerTransaction(invoke(CONTRACT_ID, 'fund').toXDR(), PASS);
    expect(info.kind).toBe('contract');
    expect(info.functionName).toBe('fund');
    expect(info.source).toBe(user.publicKey());
  });

  it('rejects calls to any other contract', () => {
    expect(() => inspectInnerTransaction(invoke(TOKENS.PUSD.contract, 'transfer').toXDR(), PASS)).toThrow(SponsorError);
  });

  it('rejects unknown functions of our contract', () => {
    expect(() => inspectInnerTransaction(invoke(CONTRACT_ID, 'upgrade').toXDR(), PASS)).toThrow(/función/i);
  });

  it('rejects unsigned transactions', () => {
    expect(() => inspectInnerTransaction(invoke(CONTRACT_ID, 'fund', user, false).toXDR(), PASS)).toThrow(/firma/i);
  });

  it('rejects transactions signed by somebody else', () => {
    const tx = invoke(CONTRACT_ID, 'fund', user, false);
    tx.sign(Keypair.random());
    expect(() => inspectInnerTransaction(tx.toXDR(), PASS)).toThrow(/firma/i);
  });

  it('accepts trustlines for PUSD and USDC only', () => {
    expect(inspectInnerTransaction(trust(new Asset('PUSD', TOKENS.PUSD.issuer)).toXDR(), PASS).kind).toBe('trust');
    expect(inspectInnerTransaction(trust(new Asset('USDC', TOKENS.USDC.issuer)).toXDR(), PASS).kind).toBe('trust');
    expect(() => inspectInnerTransaction(trust(new Asset('SCAM', TOKENS.PUSD.issuer)).toXDR(), PASS)).toThrow(SponsorError);
  });

  it('rejects payments and multi-operation transactions', () => {
    const pay = new TransactionBuilder(new Account(user.publicKey(), '1'), { fee: '100', networkPassphrase: PASS })
      .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '10' }))
      .setTimeout(60)
      .build();
    pay.sign(user);
    expect(() => inspectInnerTransaction(pay.toXDR(), PASS)).toThrow(SponsorError);

    const two = new TransactionBuilder(new Account(user.publicKey(), '1'), { fee: '200', networkPassphrase: PASS })
      .addOperation(Operation.changeTrust({ asset: new Asset('PUSD', TOKENS.PUSD.issuer) }))
      .addOperation(Operation.changeTrust({ asset: new Asset('USDC', TOKENS.USDC.issuer) }))
      .setTimeout(60)
      .build();
    two.sign(user);
    expect(() => inspectInnerTransaction(two.toXDR(), PASS)).toThrow(/una operación/i);
  });

  it('rejects an excessive resource fee', () => {
    const tx = new TransactionBuilder(new Account(user.publicKey(), '1'), { fee: '900000000', networkPassphrase: PASS })
      .addOperation(Operation.invokeContractFunction({ contract: CONTRACT_ID, function: 'fund', args: [] }))
      .setTimeout(60)
      .build();
    tx.sign(user);
    expect(() => inspectInnerTransaction(tx.toXDR(), PASS)).toThrow(/comisión/i);
  });

  it('rejects garbage', () => {
    expect(() => inspectInnerTransaction('not-xdr', PASS)).toThrow(SponsorError);
  });
});

describe('buildSponsoredEnvelope', () => {
  it('wraps the user-signed transaction in a fee bump paid by the sponsor', () => {
    const sponsor = Keypair.random();
    const inner = invoke(CONTRACT_ID, 'fund');
    const bumped = buildSponsoredEnvelope(inner, sponsor, PASS);
    expect(bumped.feeSource).toBe(sponsor.publicKey());
    expect(bumped.innerTransaction.source).toBe(user.publicKey());
    expect(bumped.innerTransaction.signatures).toHaveLength(1);
    expect(bumped.signatures).toHaveLength(1);
    expect(Number(bumped.fee)).toBeGreaterThanOrEqual(Number(inner.fee));
  });

  it('refuses to sponsor when the sponsor is the inner source', () => {
    const sponsor = Keypair.random();
    const inner = invoke(CONTRACT_ID, 'fund', sponsor);
    expect(() => inspectInnerTransaction(inner.toXDR(), PASS, sponsor.publicKey())).toThrow(/patrocinador/i);
  });
});

describe('checkRateLimit', () => {
  it('allows a burst then blocks, per key', () => {
    const bucket = new Map<string, number[]>();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(() => checkRateLimit(bucket, 'a', 3, 60_000, now + i)).not.toThrow();
    expect(() => checkRateLimit(bucket, 'a', 3, 60_000, now + 10)).toThrow(/demasiad/i);
    expect(() => checkRateLimit(bucket, 'b', 3, 60_000, now + 10)).not.toThrow();
    expect(() => checkRateLimit(bucket, 'a', 3, 60_000, now + 61_000)).not.toThrow();
  });
});

describe('sdk surface sanity', () => {
  it('exposes rpc.Server', () => {
    expect(typeof rpc.Server).toBe('function');
  });
});
