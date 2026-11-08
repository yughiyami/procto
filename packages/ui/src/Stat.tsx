import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

/** Label + big value + optional caption, for financial figures (money, quantities). */
export function Stat({ label, value, caption, tone = 'neutral', className, ...rest }: StatProps) {
  return (
    <div className={cx('izu-stat', className)} {...rest}>
      <span className="izu-stat__label">{label}</span>
      <span className={cx('izu-stat__value', tone !== 'neutral' && `izu-stat__value--${tone}`)}>
        {value}
      </span>
      {caption ? <span className="izu-stat__caption">{caption}</span> : null}
    </div>
  );
}
