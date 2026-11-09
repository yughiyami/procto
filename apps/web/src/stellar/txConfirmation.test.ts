import { describe, expect, it, vi } from 'vitest';
import { fetchTxConfirmation, formatConfirmedAt, horizonTxUrl, mapHorizonTx } from './txConfirmation';

const A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBZZ';
const base = { successful: true, ledger: 123456, created_at: '2026-11-09T05:08:09Z', source_account: A, fee_account: A };
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe('mapHorizonTx', () => {
  it('maps a successful transaction paid by its own account', () => {
    expect(mapHorizonTx(base)).toEqual({ successful: true, ledger: 123456, confirmedAt: '2026-11-09T05:08:09Z', feePaidByPlatform: false });
  });
  it('flags when another account paid the fee', () => {
    expect(mapHorizonTx({ ...base, fee_account: B }).feePaidByPlatform).toBe(true);
  });
  it('keeps failed transactions as not successful', () => {
    expect(mapHorizonTx({ ...base, successful: false }).successful).toBe(false);
  });
  it('treats a missing fee account as not sponsored and rejects malformed bodies', () => {
    expect(mapHorizonTx({ ...base, fee_account: undefined }).feePaidByPlatform).toBe(false);
    expect(() => mapHorizonTx(null)).toThrow();
    expect(() => mapHorizonTx({ successful: true })).toThrow();
  });
});

describe('formatConfirmedAt', () => {
  it('formats in es-PE (Lima time)', () => {
    expect(formatConfirmedAt('2026-11-09T05:08:09Z')).toMatch(/^9\/11\/2026/);
    expect(formatConfirmedAt('2026-11-09T05:08:09Z')).toMatch(/12:08/);
  });
  it('returns an empty string for an invalid date', () => {
    expect(formatConfirmedAt('nope')).toBe('');
  });
});

describe('horizonTxUrl', () => {
  it('points at the raw Horizon record', () => {
    expect(horizonTxUrl('abc')).toBe('https://horizon-testnet.stellar.org/transactions/abc');
  });
});

describe('fetchTxConfirmation', () => {
  it('returns the mapped record', async () => {
    const f = vi.fn(async (_url: string) => res(base));
    expect(await fetchTxConfirmation('abc', f as unknown as typeof fetch)).toMatchObject({ ledger: 123456 });
    expect(f.mock.calls[0]![0]).toBe(horizonTxUrl('abc'));
  });
  it('returns null on 404 (not indexed yet)', async () => {
    expect(await fetchTxConfirmation('abc', (async () => res({}, 404)) as unknown as typeof fetch)).toBeNull();
  });
  it('throws on other failures', async () => {
    await expect(fetchTxConfirmation('abc', (async () => res({}, 503)) as unknown as typeof fetch)).rejects.toThrow();
  });
});
