import { describe, expect, it } from 'vitest';
import { IMPACT_SHARE_BPS, commissionRateBps, describeCommission, splitCommission } from './commission';

describe('commissionRateBps', () => {
  it('is 3% for standard accounts and 2% for PRO', () => {
    expect(commissionRateBps(false)).toBe(300);
    expect(commissionRateBps(true)).toBe(200);
  });
});

describe('splitCommission', () => {
  it('takes 3% of a S/ 30,000 sale and sends 8% of it to the impact fund', () => {
    const s = splitCommission(3_000_000, false);
    expect(s.commissionCents).toBe(90_000);
    expect(s.impactCents).toBe(7_200);
    expect(s.treasuryCents).toBe(82_800);
  });

  it('charges 2% for PRO coordinators', () => {
    const s = splitCommission(3_000_000, true);
    expect(s.commissionCents).toBe(60_000);
    expect(s.impactCents).toBe(4_800);
    expect(s.treasuryCents).toBe(55_200);
  });

  it('never loses a cent to rounding', () => {
    for (const price of [1, 99, 12_345, 3_333_333, 7_777_777]) {
      for (const pro of [false, true]) {
        const s = splitCommission(price, pro);
        expect(s.treasuryCents + s.impactCents).toBe(s.commissionCents);
        expect(s.commissionCents).toBe(Math.floor((price * commissionRateBps(pro)) / 10_000));
        expect(s.impactCents).toBe(Math.floor((s.commissionCents * IMPACT_SHARE_BPS) / 10_000));
      }
    }
  });

  it('has no commission on a zero price', () => {
    expect(splitCommission(0, false)).toMatchObject({ commissionCents: 0, impactCents: 0, treasuryCents: 0 });
  });
});

describe('describeCommission', () => {
  it('explains the rate and the impact share in plain Spanish', () => {
    expect(describeCommission(false)).toMatch(/3%/);
    expect(describeCommission(true)).toMatch(/2%/);
    expect(describeCommission(false)).toMatch(/8%/);
    expect(describeCommission(false)).toMatch(/reforestación/i);
  });
});
