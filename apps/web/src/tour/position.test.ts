import { describe, expect, it } from 'vitest';
import { placeCard } from './position';

const card = { width: 360, height: 200 };
const desktop = { width: 1200, height: 800 };

describe('placeCard', () => {
  it('uses a bottom sheet on phones', () => {
    expect(placeCard({ top: 100, left: 10, width: 100, height: 40 }, { width: 390, height: 800 }, card)).toEqual({ kind: 'sheet' });
  });
  it('centers when there is nothing to point at', () => {
    expect(placeCard(null, desktop, card)).toEqual({ kind: 'center' });
  });
  it('goes below the target when there is room', () => {
    const p = placeCard({ top: 100, left: 500, width: 200, height: 50 }, desktop, card);
    expect(p).toMatchObject({ kind: 'below', top: 164 });
    if (p.kind === 'below') expect(p.left).toBe(600 - 180);
  });
  it('goes above when the target is near the bottom', () => {
    const p = placeCard({ top: 650, left: 500, width: 200, height: 50 }, desktop, card);
    expect(p.kind).toBe('above');
  });
  it('keeps the card inside the viewport horizontally', () => {
    const p = placeCard({ top: 100, left: 0, width: 40, height: 40 }, desktop, card);
    if (p.kind !== 'below') throw new Error('expected below');
    expect(p.left).toBe(12);
    const q = placeCard({ top: 100, left: 1180, width: 20, height: 40 }, desktop, card);
    if (q.kind !== 'below') throw new Error('expected below');
    expect(q.left).toBe(1200 - 360 - 12);
  });
  it('falls back to the center for a target that fills the screen', () => {
    expect(placeCard({ top: 0, left: 0, width: 1200, height: 800 }, desktop, card)).toEqual({ kind: 'center' });
  });
});
