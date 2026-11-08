import type { ReactNode } from 'react';
import { cx } from './cx';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, breadcrumb, actions, className }: PageHeaderProps) {
  return (
    <header className={cx('izu-page-header', className)}>
      {breadcrumb ? <div className="izu-page-header__breadcrumb">{breadcrumb}</div> : null}
      <div className="izu-page-header__row">
        <div className="izu-page-header__heading">
          <h1 className="izu-page-header__title">{title}</h1>
          {subtitle ? <p className="izu-page-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="izu-page-header__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
