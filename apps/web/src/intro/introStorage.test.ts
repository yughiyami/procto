import { describe, expect, it } from 'vitest';
import { INTRO_KEY, isIntroSeen, markIntroSeen, resetIntroSeen } from './introStorage';
import type { IntroStorage } from './introStorage';

function memory(): IntroStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const blocked: IntroStorage = {
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

describe('introStorage', () => {
  it('is unseen on a first visit', () => {
    expect(isIntroSeen(memory())).toBe(false);
  });
  it('remembers that the video was watched or skipped, per video version', () => {
    const s = memory();
    markIntroSeen('v1', s);
    expect(s.data.get(INTRO_KEY)).toBe('v1');
    expect(isIntroSeen(s, 'v1')).toBe(true);
    // A new cut of the video is shown again to people who saw the old one.
    expect(isIntroSeen(s, 'v2')).toBe(false);
  });
  it('can be reset', () => {
    const s = memory();
    markIntroSeen('v1', s);
    resetIntroSeen(s);
    expect(isIntroSeen(s, 'v1')).toBe(false);
  });
  it('never throws when storage is blocked or missing', () => {
    expect(() => markIntroSeen('v1', blocked)).not.toThrow();
    expect(() => resetIntroSeen(blocked)).not.toThrow();
    expect(isIntroSeen(blocked, 'v1')).toBe(false);
    expect(isIntroSeen(null, 'v1')).toBe(false);
  });
});
