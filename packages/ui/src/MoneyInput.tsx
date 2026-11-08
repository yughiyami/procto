import type { InputHTMLAttributes, Ref } from 'react';
import { useState } from 'react';
import { cx } from './cx';

export interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
  /** Formats integer cents into the text shown while the field is not focused. */
  format?: (cents: number) => string;
  /** Parses raw user text into integer cents, or null if not a valid amount. */
  parse?: (raw: string) => number | null;
  error?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** Default formatter: 123456 -> "1,234.56" (no currency symbol, that's the prefix adornment). */
function defaultFormat(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${whole.toLocaleString('es-PE')}.${fraction}`;
}

/** Default parser: accepts "1234.56" or "1,234.56", rejects more than 2 decimals. */
function defaultParse(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  // The regex above guarantees a leading segment, but the index signature does not.
  const [wholePart = '', fractionPart = ''] = cleaned.split('.');
  const negative = wholePart.startsWith('-');
  const wholeDigits = wholePart.replace('-', '') || '0';
  const fractionDigits = fractionPart.padEnd(2, '0');
  const cents = Number(wholeDigits) * 100 + Number(fractionDigits);
  return negative ? -cents : cents;
}

/**
 * PEN amount input. Kept free of @izumi/contracts on purpose — this package is
 * domain-agnostic; callers may inject the contracts' own parse/format helpers
 * via props to guarantee byte-for-byte agreement with the backend's rules.
 */
export function MoneyInput({
  valueCents,
  onChangeCents,
  format = defaultFormat,
  parse = defaultParse,
  className,
  error,
  id,
  ref,
  ...rest
}: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? (valueCents === null ? '' : format(valueCents));

  return (
    <span className={cx('izu-money-input', className)}>
      <span className="izu-money-input__prefix" aria-hidden="true">
        S/
      </span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        className="izu-input"
        aria-invalid={error || undefined}
        value={displayValue}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          onChangeCents(parse(raw));
        }}
        onBlur={() => setDraft(null)}
        {...rest}
      />
    </span>
  );
}
