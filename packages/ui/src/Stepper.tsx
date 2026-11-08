import { cx } from './cx';

export interface StepperStep {
  key: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  currentKey: string;
  /** Per-step state override, e.g. to mark a step 'cancelled' when the order was cancelled mid-flow. */
  state?: Record<string, 'done' | 'current' | 'todo' | 'cancelled'>;
  /** Forces the compact (icon-only) layout regardless of viewport width. */
  compact?: boolean;
  className?: string;
}

/** Horizontal progress indicator for the order lifecycle. Collapses to icon-only at 320px via CSS. */
export function Stepper({ steps, currentKey, state, compact, className }: StepperProps) {
  const currentIndex = steps.findIndex((step) => step.key === currentKey);

  function resolveState(key: string, index: number): 'done' | 'current' | 'todo' | 'cancelled' {
    const override = state?.[key];
    if (override) return override;
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'current';
    return 'todo';
  }

  return (
    <ol
      className={cx('izu-stepper', compact && 'izu-stepper--compact', className)}
      aria-label="Progreso del pedido"
    >
      {steps.map((step, index) => {
        const stepState = resolveState(step.key, index);
        return (
          <li
            key={step.key}
            className={cx('izu-stepper__step', `izu-stepper__step--${stepState}`)}
            aria-current={stepState === 'current' ? 'step' : undefined}
          >
            <span className="izu-stepper__dot" aria-hidden="true">
              {stepState === 'done' ? '✓' : stepState === 'cancelled' ? '×' : index + 1}
            </span>
            <span className="izu-stepper__label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
