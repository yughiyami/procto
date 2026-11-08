import type { Ref, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, error, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      className={cx('izu-textarea', className)}
      aria-invalid={error || undefined}
      {...rest}
    />
  );
}
