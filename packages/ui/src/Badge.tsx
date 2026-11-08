import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
}

export function Badge({ tone = 'neutral', size = 'sm', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('izu-badge', `izu-badge--${tone}`, `izu-badge--${size}`, className)}
      {...rest}
    >
      {children}
    </span>
  );
}
