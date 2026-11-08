import type { ReactNode } from 'react';
import { cx } from './cx';

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  /** Optional column-level alignment; defaults to left. */
  align?: 'left' | 'right' | 'center';
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  keyExtractor: (row: Row) => string;
  className?: string;
  /** Rendered instead of the body when `rows` is empty. */
  emptyContent?: ReactNode;
}

/**
 * Responsive data table. Below 640px each row collapses into a stacked
 * definition-list card via `data-label` on cells (see styles.css).
 */
export function Table<Row>({ columns, rows, keyExtractor, className, emptyContent }: TableProps<Row>) {
  if (rows.length === 0 && emptyContent) {
    return <>{emptyContent}</>;
  }

  return (
    <div className="izu-table-wrapper">
      <table className={cx('izu-table', className)}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.align ? { textAlign: column.align } : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyExtractor(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={typeof column.header === 'string' ? column.header : undefined}
                  style={column.align ? { textAlign: column.align } : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
