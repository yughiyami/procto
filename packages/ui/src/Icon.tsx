import type { SVGAttributes } from 'react';
import { cx } from './cx';
import { iconPaths } from './iconPaths';

/**
 * Complete icon vocabulary shipped by @izumi/ui. Keep in sync with
 * `iconPaths.ts` (a `Record<IconName, ReactNode>` — TypeScript will error on
 * any mismatch since both files reference this same union).
 */
export type IconName =
  // Navigation and objects
  | 'orders'
  | 'order-new'
  | 'suppliers'
  | 'inbox'
  | 'chat'
  | 'integrations'
  | 'agents'
  | 'finance'
  | 'evidence'
  | 'blockchain'
  | 'settings'
  // Status and feedback
  | 'check'
  | 'check-circle'
  | 'alert-triangle'
  | 'alert-circle'
  | 'info'
  | 'clock'
  | 'x'
  | 'x-circle'
  | 'pause'
  | 'play'
  | 'refresh'
  | 'send'
  | 'link'
  | 'copy'
  | 'download'
  | 'external-link'
  | 'search'
  | 'filter'
  | 'plus'
  | 'minus'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'arrow-left'
  | 'arrow-right'
  | 'menu'
  | 'eye'
  | 'eye-off'
  | 'trash'
  | 'edit'
  | 'calendar'
  | 'package'
  | 'truck'
  | 'user'
  | 'lock'
  | 'spark';

const ICON_SIZE = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'width' | 'height'> {
  name: IconName;
  /** 16 / 20 / 24, or an exact pixel value. Defaults to 'md' (20). */
  size?: number | keyof typeof ICON_SIZE;
  /**
   * Accessible name. When omitted (the common case — an icon sitting next to
   * visible text) the icon is `aria-hidden` so assistive tech doesn't
   * announce it twice. When given, the icon becomes the accessible element
   * itself (`role="img"` + `aria-label`).
   */
  label?: string;
}

/** Runtime guard: is `value` one of the names this package ships an icon for? */
export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && Object.hasOwn(iconPaths, value);
}

/**
 * Inline SVG icon on a 24x24 grid, stroke-only (`currentColor`), sized in
 * discrete steps so every icon stays legible at 20px on a cheap screen.
 * Never hardcode a fill/stroke color here — the caller's text color always
 * drives it.
 */
export function Icon({ name, size = 'md', label, className, ...rest }: IconProps) {
  const dimension = typeof size === 'number' ? size : ICON_SIZE[size];
  const a11yProps = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true, focusable: false } as const);

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={dimension}
      height={dimension}
      className={cx('izu-icon', className)}
      {...a11yProps}
      {...rest}
    >
      {iconPaths[name]}
    </svg>
  );
}
