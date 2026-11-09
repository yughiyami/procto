import { describe, expect, it } from 'vitest';
import type { Order } from '@izumi/contracts';
import { buildPacoContext } from './context';

const order = { id: 'o1', title: '300 chompas', status: 'accepted', quote: { priceCents: 3_000_000 }, accepted: { version: 1 } } as unknown as Order;
const share = (over: object = {}) => ({ label: 'Taller', amount: 10_000_000_000n, paid: false, refunded: false, delivered: false, offer_price: undefined, ...over });

describe('buildPacoContext', () => {
  it('summarizes orders without a payment', () => {
    const ctx = buildPacoContext({ role: 'proveedor', pro: true, orders: [order] });
    expect(ctx.payment).toBeNull();
    expect(ctx.orders).toEqual([{ title: '300 chompas', status: 'accepted', priceCents: 3_000_000, accepted: true }]);
    expect(ctx.pro).toBe(true);
  });

  it('counts the shares waiting on each actor', () => {
    const ctx = buildPacoContext({
      role: 'comprador',
      pro: false,
      orders: [order],
      active: {
        order,
        status: 'Funded',
        shares: [share(), share({ delivered: true }), share({ offer_price: 1n }), share({ paid: true, delivered: true })],
      },
    });
    expect(ctx.payment).toMatchObject({ phase: 'Funded', deliveredUnpaid: 1, waitingDelivery: 1, offered: 1 });
    expect(ctx.payment!.shares).toHaveLength(4);
    expect(ctx.payment!.shares[3]!.state).toBe('Pagado');
    expect(ctx.payment!.totalCents).toBeGreaterThan(0);
  });

  it('caps the number of orders', () => {
    const ctx = buildPacoContext({ role: 'comprador', pro: false, orders: Array.from({ length: 12 }, () => order) });
    expect(ctx.orders).toHaveLength(5);
  });
});
