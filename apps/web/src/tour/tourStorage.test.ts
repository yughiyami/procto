import { describe, expect, it } from 'vitest';
import { TOUR_KEY, isTourDone, markTourDone, resetTour } from './tourStorage';
import type { TourStorage } from './tourStorage';

function memory(): TourStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: TourStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

describe('tourStorage', () => {
  it('is not done on a first visit', () => {
    expect(isTourDone(memory())).toBe(false);
  });
  it('remembers completion', () => {
    const s = memory();
    markTourDone(s);
    expect(s.data.get(TOUR_KEY)).toBe('done');
    expect(isTourDone(s)).toBe(true);
  });
  it('can be reset', () => {
    const s = memory();
    markTourDone(s);
    resetTour(s);
    expect(isTourDone(s)).toBe(false);
  });
  it('never throws when storage is blocked or missing', () => {
    expect(() => markTourDone(throwing)).not.toThrow();
    expect(() => resetTour(throwing)).not.toThrow();
    expect(isTourDone(throwing)).toBe(false);
    expect(isTourDone(null)).toBe(false);
  });
});
