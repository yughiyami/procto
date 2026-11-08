import { cx } from './cx';

export interface SpinnerProps {
  size?: 'sm' | 'lg';
  className?: string;
  /** Overrides the default Spanish "Cargando" label announced to assistive tech. */
  label?: string;
}

export function Spinner({ size = 'sm', className, label = 'Cargando' }: SpinnerProps) {
  return (
    <span role="status" className={cx('izu-spinner', size === 'lg' && 'izu-spinner--lg', className)}>
      <span className="izu-visually-hidden">{label}</span>
    </span>
  );
}
