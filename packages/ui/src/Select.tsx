import type { Ref, SelectHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ className, error, ref, children, ...rest }: SelectProps) {
  return (
    <span className="izu-select-wrapper">
      <select
        ref={ref}
        className={cx('izu-select', className)}
        aria-invalid={error || undefined}
        {...rest}
      >
        {children}
      </select>
      <Icon name="chevron-down" size="sm" className="izu-select__chevron" />
    </span>
  );
}
