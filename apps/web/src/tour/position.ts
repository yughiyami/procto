/** Where the tour card goes relative to the highlighted element. Pure; unit-tested. */

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

export type Placement =
  | { kind: 'center' }
  | { kind: 'sheet' }
  | { kind: 'below' | 'above'; top: number; left: number };

/** Below this width the card becomes a bottom sheet so it never covers the highlighted element's context. */
export const SHEET_MAX_WIDTH = 640;

export function placeCard(target: Rect | null, viewport: Size, card: Size, gap = 14, edge = 12): Placement {
  if (viewport.width <= SHEET_MAX_WIDTH) return { kind: 'sheet' };
  if (!target) return { kind: 'center' };

  const clampLeft = (left: number) => Math.max(edge, Math.min(left, viewport.width - card.width - edge));
  const left = clampLeft(target.left + target.width / 2 - card.width / 2);
  const below = target.top + target.height + gap;
  if (below + card.height + edge <= viewport.height) return { kind: 'below', top: below, left };
  const above = target.top - gap - card.height;
  if (above >= edge) return { kind: 'above', top: above, left };
  // The target is taller than the free space on either side: fall back to the middle of the screen.
  return { kind: 'center' };
}
