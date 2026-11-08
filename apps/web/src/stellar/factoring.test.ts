import { describe, expect, it } from 'vitest';
import { advanceQuote, daysUntil, suggestAdvancePrice } from './factoring';

describe('factoring', () => {
  it('suggests 96% of the claim, floored', () => {
    expect(suggestAdvancePrice(1_000_000n)).toBe(960_000n);
    expect(suggestAdvancePrice(101n)).toBe(96n);
  });

  it('counts days until a unix deadline, at least one', () => {
    const now = Date.parse('2026-11-08T00:00:00Z');
    expect(daysUntil(Math.floor(now / 1000) + 30 * 86400, now)).toBe(30);
    expect(daysUntil(Math.floor(now / 1000) + 3600, now)).toBe(1);
    expect(daysUntil(Math.floor(now / 1000) - 100, now)).toBe(1);
  });

  it('computes the investor yield and the annualised effective rate', () => {
    const q = advanceQuote({ amount: 1_000_000n, price: 960_000n, days: 30 });
    expect(q.discountPct).toBeCloseTo(4, 5);
    expect(q.profit).toBe(40_000n);
    // (1000000/960000)^(365/30) - 1 ~ 0.6428
    expect(q.annualRate).toBeCloseTo(0.6428, 2);
    expect(q.periodRate).toBeCloseTo(0.041667, 5);
  });

  it('rejects an invalid price', () => {
    expect(() => advanceQuote({ amount: 100n, price: 0n, days: 10 })).toThrow();
    expect(() => advanceQuote({ amount: 100n, price: 101n, days: 10 })).toThrow();
  });
});
