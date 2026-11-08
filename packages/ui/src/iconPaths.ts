import type { ReactNode } from 'react';
import { createElement as h, Fragment } from 'react';
import type { IconName } from './Icon';

/**
 * Raw path data for every icon, keyed by name. Kept separate from Icon.tsx
 * so that component stays logic-only. All shapes are drawn on a 24x24 grid
 * and rely on the parent <svg> for fill/stroke/strokeWidth (set once in
 * Icon.tsx) — nothing here hardcodes a color or a stroke width.
 *
 * Built with `createElement` instead of JSX so this can stay a plain .ts
 * file (JSX syntax requires a .tsx extension under this project's
 * TypeScript config).
 */
export const iconPaths: Record<IconName, ReactNode> = {
  // ---------- Navigation and objects ----------

  orders: h(
    Fragment,
    null,
    h('rect', { x: 4.5, y: 6, width: 13, height: 15, rx: 1.5 }),
    h('path', { d: 'M7.5 6V4.5A1.5 1.5 0 0 1 9 3h9a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 17h-1' }),
    h('line', { x1: 7.5, y1: 11, x2: 14.5, y2: 11 }),
    h('line', { x1: 7.5, y1: 14.5, x2: 14.5, y2: 14.5 }),
  ),

  'order-new': h(
    Fragment,
    null,
    h('rect', { x: 5, y: 3, width: 14, height: 18, rx: 1.5 }),
    h('line', { x1: 8.5, y1: 8.5, x2: 15.5, y2: 8.5 }),
    h('line', { x1: 8.5, y1: 12.5, x2: 13, y2: 12.5 }),
    h('circle', { cx: 16.5, cy: 16.5, r: 3.25 }),
    h('line', { x1: 16.5, y1: 15, x2: 16.5, y2: 18 }),
    h('line', { x1: 15, y1: 16.5, x2: 18, y2: 16.5 }),
  ),

  suppliers: h(
    Fragment,
    null,
    h('circle', { cx: 9, cy: 8, r: 3 }),
    h('path', { d: 'M3.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6' }),
    h('circle', { cx: 17, cy: 7, r: 2.25 }),
    h('path', { d: 'M14.5 13.25c2.6.2 4.5 2.4 4.9 5.75' }),
  ),

  inbox: h(
    Fragment,
    null,
    h('path', { d: 'M4 13h4.5l1.5 2.5h4L15.5 13H20' }),
    h('path', {
      d: 'M4 13 5.8 5.6A1.5 1.5 0 0 1 7.25 4.5h9.5a1.5 1.5 0 0 1 1.45 1.1L20 13v5.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z',
    }),
  ),

  chat: h('path', {
    d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9.5L5 20v-4.3A2.5 2.5 0 0 1 4 13.5Z',
  }),

  integrations: h(
    Fragment,
    null,
    h('circle', { cx: 6, cy: 6, r: 2.25 }),
    h('circle', { cx: 18, cy: 6, r: 2.25 }),
    h('circle', { cx: 12, cy: 18, r: 2.25 }),
    h('path', { d: 'M7.9 7.3 10.5 16' }),
    h('path', { d: 'M16.1 7.3 13.5 16' }),
    h('path', { d: 'M8.2 6h7.6' }),
  ),

  agents: h(
    Fragment,
    null,
    h('path', { d: 'M8 4 9 7 12 8 9 9 8 12 7 9 4 8 7 7Z' }),
    h('path', { d: 'M17 11 17.8 13.3 20 14 17.8 14.7 17 17 16.2 14.7 14 14 16.2 13.3Z' }),
  ),

  finance: h(
    Fragment,
    null,
    h('rect', { x: 3, y: 7, width: 18, height: 11, rx: 1.5 }),
    h('circle', { cx: 12, cy: 12.5, r: 2.5 }),
    h('line', { x1: 6, y1: 10, x2: 6, y2: 10.01 }),
    h('line', { x1: 18, y1: 15, x2: 18, y2: 15.01 }),
  ),

  evidence: h(
    Fragment,
    null,
    h('path', { d: 'M12 3 19 6v5.5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6Z' }),
    h('path', { d: 'M9 12.3 11.2 14.5 15.2 10' }),
  ),

  blockchain: h(
    Fragment,
    null,
    h('rect', { x: 2.5, y: 9, width: 6, height: 6, rx: 1 }),
    h('rect', { x: 9.5, y: 9, width: 6, height: 6, rx: 1 }),
    h('rect', { x: 16.5, y: 9, width: 6, height: 6, rx: 1 }),
    h('line', { x1: 8.5, y1: 12, x2: 9.5, y2: 12 }),
    h('line', { x1: 15.5, y1: 12, x2: 16.5, y2: 12 }),
  ),

  settings: h(
    Fragment,
    null,
    h('circle', { cx: 12, cy: 12, r: 3 }),
    h('path', {
      d: 'M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.55 1.55M7.15 16.85 5.6 18.4M18.4 18.4l-1.55-1.55M7.15 7.15 5.6 5.6',
    }),
  ),

  // ---------- Status and feedback ----------

  check: h('path', { d: 'M4.5 12.5 9.5 17.5 19.5 6.5' }),

  'check-circle': h(
    Fragment,
    null,
    h('circle', { cx: 12, cy: 12, r: 8.5 }),
    h('path', { d: 'M8 12.3 10.7 15 16 9.3' }),
  ),

  'alert-triangle': h(
    Fragment,
    null,
    h('path', { d: 'M12 3.5 21.5 20h-19Z' }),
    h('line', { x1: 12, y1: 9.5, x2: 12, y2: 13.5 }),
    h('line', { x1: 12, y1: 16.3, x2: 12, y2: 16.31 }),
  ),

  'alert-circle': h(
    Fragment,
    null,
    h('circle', { cx: 12, cy: 12, r: 8.5 }),
    h('line', { x1: 12, y1: 7.5, x2: 12, y2: 12.5 }),
    h('line', { x1: 12, y1: 15.8, x2: 12, y2: 15.81 }),
  ),

  info: h(
    Fragment,
    null,
    h('circle', { cx: 12, cy: 12, r: 8.5 }),
    h('line', { x1: 12, y1: 11, x2: 12, y2: 16 }),
    h('line', { x1: 12, y1: 7.8, x2: 12, y2: 7.81 }),
  ),

  clock: h(
    Fragment,
    null,
    h('circle', { cx: 12, cy: 12, r: 8.5 }),
    h('path', { d: 'M12 7.5V12l3.5 2' }),
  ),

  x: h(
    Fragment,
    null,
    h('line', { x1: 6, y1: 6, x2: 18, y2: 18 }),
    h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
  ),

  'x-circle': h(
    Fragment,
    null,
    h('circle', { cx: 12, cy: 12, r: 8.5 }),
    h('line', { x1: 9, y1: 9, x2: 15, y2: 15 }),
    h('line', { x1: 15, y1: 9, x2: 9, y2: 15 }),
  ),

  pause: h(
    Fragment,
    null,
    h('line', { x1: 9, y1: 5, x2: 9, y2: 19 }),
    h('line', { x1: 15, y1: 5, x2: 15, y2: 19 }),
  ),

  play: h('path', { d: 'M8 5.5 19 12 8 18.5Z' }),

  refresh: h(
    Fragment,
    null,
    h('path', { d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3' }),
    h('path', { d: 'M19.5 4.5v4.7h-4.7' }),
  ),

  send: h(
    Fragment,
    null,
    h('path', { d: 'M21 3 10.5 13.5' }),
    h('path', { d: 'M21 3 14 21l-3.5-7.5L3 10Z' }),
  ),

  link: h(
    Fragment,
    null,
    h('path', { d: 'M10 14 6.8 17.2a3.5 3.5 0 0 1-4.9-4.9L5 9' }),
    h('path', { d: 'M14 10 17.2 6.8a3.5 3.5 0 0 1 4.9 4.9L19 15' }),
    h('line', { x1: 9, y1: 15, x2: 15, y2: 9 }),
  ),

  copy: h(
    Fragment,
    null,
    h('rect', { x: 9, y: 9, width: 11, height: 11, rx: 1.5 }),
    h('path', { d: 'M6.5 15H5A1.5 1.5 0 0 1 3.5 13.5v-9A1.5 1.5 0 0 1 5 3h9A1.5 1.5 0 0 1 15.5 4.5v1.5' }),
  ),

  download: h(
    Fragment,
    null,
    h('path', { d: 'M12 4v11' }),
    h('path', { d: 'M7.5 11 12 15.5 16.5 11' }),
    h('path', { d: 'M4.5 18h15' }),
  ),

  'external-link': h(
    Fragment,
    null,
    h('path', { d: 'M9 6H5.5A1.5 1.5 0 0 0 4 7.5v11A1.5 1.5 0 0 0 5.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15' }),
    h('path', { d: 'M14 4h6v6' }),
    h('line', { x1: 20, y1: 4, x2: 11, y2: 13 }),
  ),

  search: h(
    Fragment,
    null,
    h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
    h('line', { x1: 15.3, y1: 15.3, x2: 20.5, y2: 20.5 }),
  ),

  filter: h('path', { d: 'M4 5h16l-6 7.5v6L10 21v-8.5Z' }),

  plus: h(
    Fragment,
    null,
    h('line', { x1: 12, y1: 5, x2: 12, y2: 19 }),
    h('line', { x1: 5, y1: 12, x2: 19, y2: 12 }),
  ),

  minus: h('line', { x1: 5, y1: 12, x2: 19, y2: 12 }),

  'chevron-down': h('path', { d: 'M6 9.5 12 15.5 18 9.5' }),

  'chevron-right': h('path', { d: 'M9.5 6 15.5 12 9.5 18' }),

  'chevron-left': h('path', { d: 'M14.5 6 8.5 12 14.5 18' }),

  'arrow-left': h(
    Fragment,
    null,
    h('line', { x1: 20, y1: 12, x2: 4, y2: 12 }),
    h('path', { d: 'M10 6 4 12l6 6' }),
  ),

  'arrow-right': h(
    Fragment,
    null,
    h('line', { x1: 4, y1: 12, x2: 20, y2: 12 }),
    h('path', { d: 'M14 6l6 6-6 6' }),
  ),

  menu: h(
    Fragment,
    null,
    h('line', { x1: 4, y1: 7, x2: 20, y2: 7 }),
    h('line', { x1: 4, y1: 12, x2: 20, y2: 12 }),
    h('line', { x1: 4, y1: 17, x2: 20, y2: 17 }),
  ),

  eye: h(
    Fragment,
    null,
    h('path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z' }),
    h('circle', { cx: 12, cy: 12, r: 2.75 }),
  ),

  'eye-off': h(
    Fragment,
    null,
    h('path', { d: 'M4 4l16 16' }),
    h('path', {
      d: 'M9.9 5.6A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.8 15.8 0 0 1-3.4 4.2M6.6 7.3A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.2-.55',
    }),
    h('path', { d: 'M9.9 10a2.75 2.75 0 0 0 3.9 3.9' }),
  ),

  trash: h(
    Fragment,
    null,
    h('path', { d: 'M4.5 7h15' }),
    h('path', { d: 'M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2' }),
    h('path', { d: 'M6.5 7 7.3 19.5A1.5 1.5 0 0 0 8.8 21h6.4a1.5 1.5 0 0 0 1.5-1.5L17.5 7' }),
    h('line', { x1: 10, y1: 11, x2: 10, y2: 17 }),
    h('line', { x1: 14, y1: 11, x2: 14, y2: 17 }),
  ),

  edit: h(
    Fragment,
    null,
    h('path', { d: 'M14.5 5.5 18.5 9.5 8 20H4v-4Z' }),
    h('line', { x1: 13, y1: 7, x2: 17, y2: 11 }),
  ),

  calendar: h(
    Fragment,
    null,
    h('rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 1.5 }),
    h('line', { x1: 3.5, y1: 9.5, x2: 20.5, y2: 9.5 }),
    h('line', { x1: 8, y1: 3, x2: 8, y2: 6.5 }),
    h('line', { x1: 16, y1: 3, x2: 16, y2: 6.5 }),
  ),

  package: h(
    Fragment,
    null,
    h('path', { d: 'M12 3 20.5 7.5v9L12 21 3.5 16.5v-9Z' }),
    h('path', { d: 'M3.5 7.5 12 12 20.5 7.5' }),
    h('line', { x1: 12, y1: 12, x2: 12, y2: 21 }),
  ),

  truck: h(
    Fragment,
    null,
    h('rect', { x: 2.5, y: 8, width: 11, height: 8, rx: 1 }),
    h('path', { d: 'M13.5 11h4l3 3v2h-7Z' }),
    h('circle', { cx: 7, cy: 18, r: 1.75 }),
    h('circle', { cx: 16.5, cy: 18, r: 1.75 }),
  ),

  user: h(
    Fragment,
    null,
    h('circle', { cx: 12, cy: 8, r: 3.5 }),
    h('path', { d: 'M4.5 20c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7' }),
  ),

  lock: h(
    Fragment,
    null,
    h('rect', { x: 5, y: 11, width: 14, height: 9.5, rx: 1.5 }),
    h('path', { d: 'M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11' }),
    h('circle', { cx: 12, cy: 15.25, r: 1 }),
  ),

  spark: h('path', { d: 'M12 3 13.6 9.4 20 11 13.6 12.6 12 19 10.4 12.6 4 11 10.4 9.4Z' }),
};
