import { describe, expect, it } from 'vitest';
import type { ChainOrderWithId } from './chain';
import { boughtBy, flattenShares, mineAsSupplier, openOffers } from './shares';

const mk = (over: object = {}) => ({
  supplier: 'GA',
  owner: 'GA',
  amount: 1000n,
  label: 'Taller',
  delivered: false,
  paid: false,
  refunded: false,
  offer_price: undefined,
  ...over,
});

const orders = [
  {
    id: '5',
    order: {
      buyer: 'GB',
      deadline: BigInt(Math.floor(Date.now() / 1000) + 10 * 86400),
      refunded: 0n,
      released: 0n,
      token: 'C',
      total: 2000n,
      status: { tag: 'Funded', values: undefined },
      shares: [mk({ offer_price: 960n }), mk({ supplier: 'GC', owner: 'GC' })],
    },
  },
] as unknown as ChainOrderWithId[];

describe('flattenShares', () => {
  const flat = flattenShares(orders);
  it('creates one row per share with plain state', () => {
    expect(flat).toHaveLength(2);
    expect(flat[0]!.state.key).toBe('offered');
    expect(flat[0]!.daysToDeadline).toBe(10);
  });
  it('filters what a workshop is owed', () => {
    expect(mineAsSupplier(flat, 'GA')).toHaveLength(1);
  });
  it('lists open offers for investors, hiding their own', () => {
    expect(openOffers(flat, 'GX')).toHaveLength(1);
    expect(openOffers(flat, 'GA')).toHaveLength(0);
  });
  it('lists claims bought by an investor', () => {
    const sold = flattenShares([{ ...orders[0]!, order: { ...orders[0]!.order, shares: [mk({ owner: 'GI' })] } }] as ChainOrderWithId[]);
    expect(boughtBy(sold, 'GI')).toHaveLength(1);
  });
});
