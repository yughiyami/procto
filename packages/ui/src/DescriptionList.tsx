import type { ReactNode } from 'react';
import { cx } from './cx';

export interface DescriptionListItem {
  key: string;
  term: ReactNode;
  detail: ReactNode;
}

export interface DescriptionListProps {
  items: DescriptionListItem[];
  className?: string;
}

/** Responsive label/value pairs: two columns from `sm` up, stacked below it. */
export function DescriptionList({ items, className }: DescriptionListProps) {
  return (
    <dl className={cx('izu-description-list', className)}>
      {items.map((item) => (
        <div className="izu-description-list__item" key={item.key}>
          <dt className="izu-description-list__term">{item.term}</dt>
          <dd className="izu-description-list__detail">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
