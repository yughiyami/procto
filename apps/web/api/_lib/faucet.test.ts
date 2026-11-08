import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/stellar/config.js';
import { FAUCET_AMOUNT, FAUCET_BALANCE_CAP, assertFaucetEligible, readPusdBalance } from './faucet.js';
import { SponsorError } from './sponsor.js';

const account = (balances: Array<Record<string, string>>) => ({ balances: balances as never });
const pusd = (balance: string) => ({ asset_type: 'credit_alpha4', asset_code: 'PUSD', asset_issuer: TOKENS.PUSD.issuer, balance });

describe('readPusdBalance', () => {
  it('returns null when the account has no PUSD trustline', () => {
    expect(readPusdBalance(account([{ asset_type: 'native', balance: '100' }]))).toBeNull();
  });
  it('ignores PUSD from another issuer', () => {
    expect(readPusdBalance(account([{ asset_type: 'credit_alpha4', asset_code: 'PUSD', asset_issuer: Keypair.random().publicKey(), balance: '5' }]))).toBeNull();
  });
  it('parses the balance', () => {
    expect(readPusdBalance(account([pusd('1234.5000000')]))).toBe(1234.5);
  });
});

describe('assertFaucetEligible', () => {
  it('requires a valid address', () => {
    expect(() => assertFaucetEligible('nope', account([]))).toThrow(SponsorError);
  });
  it('requires the account to be prepared (trustline)', () => {
    expect(() => assertFaucetEligible(Keypair.random().publicKey(), account([]))).toThrow(/prepar/i);
  });
  it('refuses accounts that already hold plenty of demo money', () => {
    expect(() => assertFaucetEligible(Keypair.random().publicKey(), account([pusd(String(FAUCET_BALANCE_CAP))]))).toThrow(/suficiente/i);
  });
  it('allows prepared accounts under the cap', () => {
    expect(() => assertFaucetEligible(Keypair.random().publicKey(), account([pusd('10')]))).not.toThrow();
    expect(FAUCET_AMOUNT).toBeGreaterThan(0);
  });
});
