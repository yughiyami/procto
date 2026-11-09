import { describe, expect, it } from 'vitest';
import { shouldShowIntro } from './introGate';

describe('shouldShowIntro', () => {
  it('shows the video on a first visit', () => {
    expect(shouldShowIntro('', false)).toBe(true);
    expect(shouldShowIntro('?rol=comprador', false)).toBe(true);
  });
  it('goes straight in for returning visitors', () => {
    expect(shouldShowIntro('?rol=proveedor', true)).toBe(false);
  });
  it('?intro=0 always skips it', () => {
    expect(shouldShowIntro('?intro=0', false)).toBe(false);
    expect(shouldShowIntro('?rol=comprador&intro=0&tour=0', false)).toBe(false);
  });
  it('?intro=1 always shows it, even if already seen', () => {
    expect(shouldShowIntro('?intro=1', true)).toBe(true);
  });
  it('ignores unknown intro values', () => {
    expect(shouldShowIntro('?intro=maybe', true)).toBe(false);
    expect(shouldShowIntro('?intro=maybe', false)).toBe(true);
  });
});
