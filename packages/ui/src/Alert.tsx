import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import type { IconName } from './Icon';

// `title` is widened to ReactNode, so the native tooltip attribute is omitted.
export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  onDismiss?: () => void;
}

const TONE_ICON: Record<NonNullable<AlertProps['tone']>, IconName | null> = {
  neutral: null,
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'alert-circle',
};

/**
 * Used heavily for the backend's honesty warnings (declared-vs-verified,
 * not-anchored evidence, cash-difference-is-not-profit). Keep it calm: the
 * leading icon is a plain outline glyph picked from `tone` and is always
 * `aria-hidden` — the tone tokens (background/text color) already carry the
 * semantics, the icon just repeats them visually. No alarm-red blobs, no
 * bold red-on-red.
 */
export function Alert({ tone = 'neutral', title, onDismiss, className, children, ...rest }: AlertProps) {
  const iconName = TONE_ICON[tone];
  return (
    <div className={cx('izu-alert', `izu-alert--${tone}`, className)} role="status" {...rest}>
      {iconName ? (
        <div className="izu-alert__icon" aria-hidden="true">
          <Icon name={iconName} />
        </div>
      ) : null}
      <div className="izu-alert__body">
        {title ? <div className="izu-alert__title">{title}</div> : null}
        <div>{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="izu-alert__dismiss"
          aria-label="Cerrar aviso"
          onClick={onDismiss}
        >
          <Icon name="x" size="sm" />
        </button>
      ) : null}
    </div>
  );
}
