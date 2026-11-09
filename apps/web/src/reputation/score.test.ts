import { describe, expect, it } from 'vitest';
import { LEVELS, scoreSupplier } from './score';
import type { ScoredShare } from './score';

const ME = 'GSUPPLIER';
const share = (over: Partial<ScoredShare> = {}): ScoredShare => ({
  orderId: '1',
  supplier: ME,
  owner: ME,
  amount: 1_000_0000000n,
  delivered: false,
  paid: false,
  refunded: false,
  offered: false,
  ...over,
});
const paid = (n: number, over: Partial<ScoredShare> = {}) => Array.from({ length: n }, (_, i) => share({ orderId: String(i), paid: true, delivered: true, ...over }));

describe('scoreSupplier', () => {
  it('ignores shares that belong to other suppliers', () => {
    const s = scoreSupplier(ME, [share({ supplier: 'GOTHER', paid: true })]);
    expect(s.sharesTotal).toBe(0);
    expect(s.level.id).toBe('sin-historial');
  });

  it('counts paid shares, on-time deliveries and volume', () => {
    const s = scoreSupplier(ME, [...paid(2), share({ orderId: '9', delivered: true }), share({ orderId: '10' })]);
    expect(s.sharesTotal).toBe(4);
    expect(s.paid).toBe(2);
    expect(s.deliveredOnTime).toBe(3);
    expect(s.pending).toBe(2);
    expect(s.volumeUnits).toBe(2_000_0000000n);
    expect(s.ordersCount).toBe(4);
  });

  it('counts refunds as missed commitments', () => {
    const s = scoreSupplier(ME, [...paid(3), share({ orderId: 'x', refunded: true })]);
    expect(s.missed).toBe(1);
    expect(s.fulfilmentRate).toBeCloseTo(0.75);
  });

  it('tracks advances sold and honored', () => {
    const s = scoreSupplier(ME, [
      ...paid(1, { owner: 'GINVESTOR' }),
      share({ orderId: 'a', owner: 'GINVESTOR', delivered: true }),
      share({ orderId: 'b', owner: 'GINVESTOR', refunded: true }),
      share({ orderId: 'c', offered: true }),
    ]);
    expect(s.advancesSold).toBe(4);
    expect(s.advancesHonored).toBe(2);
    expect(s.advancesDefaulted).toBe(1);
  });

  it('has no rate without closed commitments', () => {
    expect(scoreSupplier(ME, [share()]).fulfilmentRate).toBeNull();
  });

  describe('badge levels are earned by history, never by payment', () => {
    it('sin historial until the first payment', () => {
      expect(scoreSupplier(ME, [share({ delivered: true })]).level.id).toBe('sin-historial');
    });
    it('bronce after one completed payment', () => {
      expect(scoreSupplier(ME, paid(1)).level.id).toBe('bronce');
    });
    it('plata needs three payments and a 90% record', () => {
      expect(scoreSupplier(ME, paid(3)).level.id).toBe('plata');
      expect(scoreSupplier(ME, [...paid(3), share({ orderId: 'm1', refunded: true }), share({ orderId: 'm2', refunded: true })]).level.id).toBe('bronce');
    });
    it('oro needs ten payments, 95% and no defaulted advance', () => {
      expect(scoreSupplier(ME, paid(10)).level.id).toBe('oro');
      expect(scoreSupplier(ME, [...paid(10), share({ orderId: 'd', owner: 'GINV', refunded: true })]).level.id).toBe('plata');
    });
  });

  it('reports what is missing for the next level', () => {
    const s = scoreSupplier(ME, paid(1));
    expect(s.next?.level.id).toBe('plata');
    expect(s.next?.missingPaid).toBe(2);
    expect(scoreSupplier(ME, paid(10)).next).toBeNull();
  });

  it('exposes the ordered level ladder', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['sin-historial', 'bronce', 'plata', 'oro']);
  });
});
