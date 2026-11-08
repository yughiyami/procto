import type { InputHTMLAttributes, Ref } from 'react';
import { cx } from './cx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, error, ref, ...rest }: InputProps) {
  return (
    <input
      ref={ref}
      className={cx('izu-input', className)}
      aria-invalid={error || undefined}
      {...rest}
    />
  );
}
