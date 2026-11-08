import { describe, expect, it } from 'vitest';
import { friendlyError, parseContractErrorCode } from './errors';

describe('parseContractErrorCode', () => {
  it('extracts the code from a simulation error', () => {
    expect(parseContractErrorCode('HostError: Error(Contract, #8)\n\nEvent log')).toBe(8);
    expect(parseContractErrorCode('nothing here')).toBeNull();
  });
});

describe('friendlyError', () => {
  it('translates our contract errors', () => {
    expect(friendlyError(new Error('HostError: Error(Contract, #13)'))).toMatch(/plazo/i);
    expect(friendlyError(new Error('HostError: Error(Contract, #12)'))).toMatch(/propio/i);
  });
  it('translates a user rejection in the wallet', () => {
    expect(friendlyError(new Error('User declined access'))).toMatch(/cancel/i);
    expect(friendlyError({ message: 'The user rejected this request.' })).toMatch(/cancel/i);
  });
  it('reports missing funds clearly', () => {
    expect(friendlyError(new Error('Error(Contract, #10) balance is not sufficient'))).toMatch(/saldo/i);
  });
  it('falls back to a generic message without technical jargon', () => {
    const msg = friendlyError(new Error('xdr decode blew up'));
    expect(msg).not.toMatch(/xdr/i);
  });
});
