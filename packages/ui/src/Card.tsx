import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div className={cx('izu-card', className)} {...rest}>
      {children}
    </div>
  );
}

// `title` is widened to ReactNode, so the native tooltip attribute is omitted.
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({ title, actions, className, ...rest }: CardHeaderProps) {
  return (
    <div className={cx('izu-card__header', className)} {...rest}>
      <h3 className="izu-card__header-title">{title}</h3>
      {actions ? <div className="izu-card__header-actions">{actions}</div> : null}
    </div>
  );
}

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {}

export function CardBody({ className, children, ...rest }: CardBodyProps) {
  return (
    <div className={cx('izu-card__body', className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function CardFooter({ className, children, ...rest }: CardFooterProps) {
  return (
    <div className={cx('izu-card__footer', className)} {...rest}>
      {children}
    </div>
  );
}
