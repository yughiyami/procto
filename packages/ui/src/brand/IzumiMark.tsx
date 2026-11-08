import type { SVGAttributes } from 'react';

export interface IzumiMarkProps extends Omit<SVGAttributes<SVGSVGElement>, 'width' | 'height'> {
  /** Pixel size (square). Defaults to 32 — the mark reads fine down to ~24px. */
  size?: number;
  /** Accessible name. Omit to render the mark as decorative (`aria-hidden`). */
  title?: string;
}

/**
 * The Izumi product mark: four small shapes converging on one shared center.
 * Izumi coordinates several independent textile workshops into a single
 * offer — the mark is deliberately built the same way, not as an abstract
 * logo. Flat single color (`currentColor`), no gradients, reads at 32px.
 *
 * See `izumi-mark.svg` for the standalone file used to generate PWA/favicon
 * assets — same geometry, baked to a fixed color instead of currentColor.
 */
export function IzumiMark({ size = 32, title, className, ...rest }: IzumiMarkProps) {
  const a11yProps = title ? ({ role: 'img' } as const) : ({ 'aria-hidden': true } as const);

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      {...a11yProps}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d="M16 16 C13.5 11 9 9 4.5 9.5 C6 14 9.5 16 16 16 Z" />
      <path d="M16 16 C21 13.5 23 9 22.5 4.5 C18 6 16 9.5 16 16 Z" />
      <path d="M16 16 C18.5 21 23 23 27.5 22.5 C26 18 22.5 16 16 16 Z" />
      <path d="M16 16 C11 18.5 9 23 9.5 27.5 C14 26 16 22.5 16 16 Z" />
      <circle cx="16" cy="16" r="2.4" />
    </svg>
  );
}
