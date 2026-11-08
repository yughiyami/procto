import type { CSSProperties, HTMLAttributes } from 'react';
import { cx } from './cx';

export interface SkeletonTextProps extends HTMLAttributes<HTMLSpanElement> {
  /** Number of stacked lines. Defaults to 1. */
  lines?: number;
  width?: string | number;
}

export function SkeletonText({ lines = 1, width, className, style, ...rest }: SkeletonTextProps) {
  if (lines > 1) {
    return (
      <span aria-hidden="true">
        {Array.from({ length: lines }).map((_, index) => (
          <span
            key={index}
            className={cx('izu-skeleton izu-skeleton-text', className)}
            style={style}
            {...rest}
          />
        ))}
      </span>
    );
  }
  const inlineStyle: CSSProperties = { ...style, width };
  return (
    <span
      aria-hidden="true"
      className={cx('izu-skeleton izu-skeleton-text', className)}
      style={inlineStyle}
      {...rest}
    />
  );
}

export interface SkeletonBlockProps extends HTMLAttributes<HTMLSpanElement> {
  width?: string | number;
  height?: string | number;
}

export function SkeletonBlock({ width, height = '120px', className, style, ...rest }: SkeletonBlockProps) {
  const inlineStyle: CSSProperties = { ...style, width, height };
  return (
    <span
      aria-hidden="true"
      className={cx('izu-skeleton izu-skeleton-block', className)}
      style={inlineStyle}
      {...rest}
    />
  );
}
