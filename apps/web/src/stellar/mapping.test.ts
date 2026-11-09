import { describe, expect, it } from 'vitest';
import { buildShares, suggestDeadline } from './mapping';
import type { Order, Supplier } from '@izumi/contracts';

const dueAt = '2026-12-20T00:00:00.000Z';
const base = {
  id: 'o1',
  title: '300 chompas',
  specification: 'x',
  quantity: 300,
  dueAt,
  ownQuantity: 100,
  ownCostCents: 100_000,
  currency: 'PEN',
  status: 'accepted',
  version: 3,
  contributions: [
    { id: 'c1', supplierId: 's1', specification: 'x', quantity: 120, unitCostCents: 2_000, availableAt: dueAt, validUntil: dueAt, confirmed: true },
    { id: 'c2', supplierId: 's2', specification: 'x', quantity: 80, unitCostCents: 1_000, availableAt: dueAt, validUntil: dueAt, confirmed: true },
  ],
  quote: { priceCents: 500_000, logisticsCents: 10_000, coordinationCents: 20_000, validUntil: dueAt, version: 2, costCents: 450_000, contributionCents: 50_000 },
  accepted: { version: 2, at: dueAt, actor: 'buyer' },
  deliveries: [],
  movements: [],
  events: [],
} as unknown as Order;

const suppliers = [
  { id: 's1', name: 'Taller de tejido' },
  { id: 's2', name: 'Taller de bordado' },
] as Supplier[];

describe('buildShares', () => {
  it('maps each supplier contribution to a share and gives the remainder to the coordinator', () => {
    const shares = buildShares(base, suppliers);
    expect(shares.map((s) => s.label)).toEqual([
      'Taller de tejido',
      'Taller de bordado',
      'Coordinación y producción propia',
    ]);
    expect(shares.map((s) => s.amountCents)).toEqual([240_000, 80_000, 180_000]);
    expect(shares.reduce((t, s) => t + s.amountCents, 0)).toBe(500_000);
    expect(shares.map((s) => s.supplierId)).toEqual(['s1', 's2', null]);
  });

  it('refuses orders that have no accepted quote', () => {
    expect(() => buildShares({ ...base, status: 'quoted', accepted: undefined } as Order, suppliers)).toThrow(/aceptad/i);
  });

  it('refuses when supplier costs exceed the price', () => {
    const bad = { ...base, quote: { ...base.quote!, priceCents: 100_000 } } as Order;
    expect(() => buildShares(bad, suppliers)).toThrow();
  });

  it('merges multiple contributions of the same supplier', () => {
    const o = { ...base, contributions: [...base.contributions, { ...base.contributions[0]!, id: 'c3', quantity: 10 }] } as Order;
    const shares = buildShares(o, suppliers);
    expect(shares[0]!.amountCents).toBe(260_000);
    expect(shares).toHaveLength(3);
  });
});

describe('buildShares with the PROCTO commission', () => {
  it('takes the commission out of the coordinator share and adds treasury and impact shares', () => {
    const shares = buildShares(base, suppliers, { commission: { pro: false } });
    // price 500,000: 3% = 15,000 -> impact 1,200, treasury 13,800
    expect(shares.map((s) => s.kind)).toEqual(['workshop', 'workshop', 'coordinator', 'platform', 'impact']);
    expect(shares.map((s) => s.amountCents)).toEqual([240_000, 80_000, 165_000, 13_800, 1_200]);
    expect(shares.reduce((t, s) => t + s.amountCents, 0)).toBe(500_000);
  });

  it('uses the 2% PRO rate', () => {
    const shares = buildShares(base, suppliers, { commission: { pro: true } });
    // 2% = 10,000 -> impact 800, treasury 9,200
    expect(shares.map((s) => s.amountCents)).toEqual([240_000, 80_000, 170_000, 9_200, 800]);
    expect(shares.reduce((t, s) => t + s.amountCents, 0)).toBe(500_000);
  });

  it('pins platform shares to the public PROCTO accounts', () => {
    const shares = buildShares(base, suppliers, { commission: { pro: false } });
    expect(shares.find((s) => s.kind === 'platform')?.address).toMatch(/^G[A-Z2-7]{55}$/);
    expect(shares.find((s) => s.kind === 'impact')?.address).toMatch(/^G[A-Z2-7]{55}$/);
    expect(shares.find((s) => s.kind === 'platform')?.address).not.toBe(shares.find((s) => s.kind === 'impact')?.address);
  });

  it('refuses when the commission does not fit in the coordinator margin', () => {
    const tight = { ...base, quote: { ...base.quote!, priceCents: 322_000 } } as Order;
    expect(() => buildShares(tight, suppliers, { commission: { pro: false } })).toThrow(/comisi/i);
  });

  it('leaves the split untouched when no commission is requested', () => {
    expect(buildShares(base, suppliers).map((s) => s.kind)).toEqual(['workshop', 'workshop', 'coordinator']);
  });
});

describe('suggestDeadline', () => {
  it('gives a grace period of 7 days after the due date', () => {
    const now = Date.parse('2026-11-08T00:00:00Z');
    expect(suggestDeadline(dueAt, now)).toBe(Math.floor(Date.parse('2026-12-27T00:00:00Z') / 1000));
  });
  it('never returns a deadline in less than 7 days from now', () => {
    const now = Date.parse('2026-12-30T00:00:00Z');
    expect(suggestDeadline(dueAt, now)).toBe(Math.floor(now / 1000) + 7 * 86400);
  });
});
