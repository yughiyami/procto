import type { ReactNode } from 'react';
import { cx } from './cx';
import { Button } from './Button';
import { Icon, isIconName } from './Icon';
import type { IconName } from './Icon';

export interface ErrorStateProps {
  /** Either a ready-made node or one of the shipped `IconName`s. Defaults to 'alert-circle'. */
  icon?: ReactNode | IconName;
  title?: ReactNode;
  message: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  icon = 'alert-circle',
  title = 'No se pudo cargar la información',
  message,
  onRetry,
  retryLabel = 'Reintentar',
  className,
}: ErrorStateProps) {
  const renderedIcon = isIconName(icon) ? <Icon name={icon} size="lg" /> : icon;
  return (
    <div className={cx('izu-error-state', className)} role="alert">
      {renderedIcon ? (
        <div className="izu-error-state__icon" aria-hidden="true">
          {renderedIcon}
        </div>
      ) : null}
      <p className="izu-error-state__title">{title}</p>
      <p className="izu-error-state__message">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
