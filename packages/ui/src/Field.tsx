import type { ReactNode } from 'react';
import { cx } from './cx';

export interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a single form control with a real <label>, optional hint, and the
 * only place error text is styled. Consumers wire aria-describedby/aria-invalid
 * on the control themselves using `hintId`/`errorId`-style ids derived from htmlFor,
 * see `fieldDescribedBy` below for the exact convention.
 */
export function Field({ label, htmlFor, required, hint, error, children, className }: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cx('izu-field', className)}>
      <label className="izu-field__label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="izu-field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <span className="izu-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="izu-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Builds the `aria-describedby` value a control passed to `Field` should use,
 * combining hint/error ids using the same convention as `Field` itself.
 */
export function fieldDescribedBy(htmlFor: string, opts: { hint?: boolean; error?: boolean }): string | undefined {
  const ids: string[] = [];
  if (opts.hint) ids.push(`${htmlFor}-hint`);
  if (opts.error) ids.push(`${htmlFor}-error`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}
