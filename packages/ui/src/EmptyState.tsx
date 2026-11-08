import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, isIconName } from './Icon';
import type { IconName } from './Icon';

export interface EmptyStateProps {
  /** Either a ready-made node (kept for backwards compatibility) or one of the shipped `IconName`s. */
  icon?: ReactNode | IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  const renderedIcon = isIconName(icon) ? <Icon name={icon} size="lg" /> : icon;
  return (
    <div className={cx('izu-empty-state', className)}>
      {renderedIcon ? (
        <div className="izu-empty-state__icon" aria-hidden="true">
          {renderedIcon}
        </div>
      ) : null}
      <p className="izu-empty-state__title">{title}</p>
      {description ? <p className="izu-empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
