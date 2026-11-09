import type { SVGAttributes } from 'react';

export interface ProctoMarkProps extends Omit<SVGAttributes<SVGSVGElement>, 'width' | 'height'> {
  /** Pixel size (square). Defaults to 32; the mark stays legible down to 16px. */
  size?: number;
  /** Accessible name. Omit to render the mark as decorative (`aria-hidden`). */
  title?: string;
}

/**
 * The PROCTO mark: three threads (the workshops) converging on one gold knot inside a
 * shield (the guarantee). It carries its own ink tile, so it reads on light and dark
 * backgrounds without depending on the surrounding color.
 *
 * Same geometry as `procto-mark.svg`, the source for the PWA and pitch assets
 * (`pnpm --filter @izumi/web icons`).
 */
export function ProctoMark({ size = 32, title, className, ...rest }: ProctoMarkProps) {
  const a11yProps = title ? ({ role: 'img' } as const) : ({ 'aria-hidden': true } as const);

  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} {...a11yProps} {...rest}>
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="7" fill="#15182b" />
      <g transform="translate(2.4 2.4) scale(0.85)">
        <path
          d="M16 2 L27.5 5.8 V15.2 C27.5 22 22.8 27.2 16 30 C9.2 27.2 4.5 22 4.5 15.2 V5.8 Z"
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <g fill="none" stroke="#2a3fa8" strokeWidth="2.8" strokeLinecap="round">
          <path d="M8.4 8.2 C11.6 10.6 16 11.4 16 16.8" />
          <path d="M23.6 8.2 C20.4 10.6 16 11.4 16 16.8" />
          <path d="M16 7.5 V16.8" />
          <path d="M16 16.8 V24.5" />
        </g>
        <circle cx="16" cy="16.8" r="3.3" fill="#d9a31b" />
      </g>
    </svg>
  );
}
