import { describe, expect, it } from 'vitest';
import {
  DEMO_FX_PEN_PER_USD,
  formatToken,
  penCentsToTokenUnits,
  tokenUnitsToPenCents,
} from './units';

describe('units', () => {
  it('documents a fixed demo FX rate', () => {
    expect(DEMO_FX_PEN_PER_USD).toBe(3.75);
  });

  it('converts PEN cents to 7-decimal token units at the fixed rate', () => {
    // S/ 3.75 == 1 token == 10_000_000 units
    expect(penCentsToTokenUnits(375)).toBe(10_000_000n);
    // S/ 3,750.00 == 1,000 tokens
    expect(penCentsToTokenUnits(375_000)).toBe(10_000_000_000n);
    expect(penCentsToTokenUnits(0)).toBe(0n);
  });

  it('rounds half up and never returns a negative amount', () => {
    expect(penCentsToTokenUnits(1)).toBe(26_667n); // 26666.67 -> 26667
    expect(() => penCentsToTokenUnits(-1)).toThrow();
    expect(() => penCentsToTokenUnits(1.5)).toThrow();
  });

  it('round-trips whole-sol amounts', () => {
    for (const cents of [100, 12_345, 5_000_000]) {
      const back = tokenUnitsToPenCents(penCentsToTokenUnits(cents));
      expect(Math.abs(back - cents)).toBeLessThanOrEqual(1);
    }
  });

  it('formats token units for display', () => {
    expect(formatToken(10_000_000n)).toBe('1.00');
    expect(formatToken(12_345_678_901n)).toBe('1,234.57');
    expect(formatToken(0n)).toBe('0.00');
  });
});
