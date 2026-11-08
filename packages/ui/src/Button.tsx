import type { ButtonHTMLAttributes, Ref } from 'react';
import { cx } from './cx';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  fullWidth?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={cx(
        'izu-button',
        `izu-button--${variant}`,
        `izu-button--${size}`,
        fullWidth && 'izu-button--full-width',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="izu-button__spinner">
          <Spinner size="sm" />
        </span>
      ) : null}
      {children}
    </button>
  );
}
