/**
 * Money is always an integer number of PEN cents (see apps/api/src/domain.ts `money` schema:
 * min 0, max 1_000_000_000). All helpers here work on strings/integers to avoid float drift
 * (e.g. never do `1234.56 * 100` directly — binary floats do not represent centavos exactly).
 */

const MAX_CENTS = 1_000_000_000;

const penFormatter = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

/** Formats integer cents as "S/ 1,234.56" for display. */
export function formatPen(cents: number): string {
  return penFormatter.format(cents / 100);
}

/**
 * Parses a user-entered amount ("1234.56", "1,234.56", "1234") into integer cents.
 * Rejects negatives, more than 2 decimals, non-numeric input, and amounts above the
 * server's max (1_000_000_000 cents). Returns null instead of throwing so forms can
 * show a friendly validation message.
 */
export function parsePenToCents(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [wholePart, decimalPart = ''] = cleaned.split('.');
  const paddedDecimal = decimalPart.padEnd(2, '0');
  const cents = Number(wholePart) * 100 + Number(paddedDecimal);
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

/** Converts integer cents into a plain decimal string ("1234.56") suitable for a form input value. */
export function centsToInput(cents: number): string {
  const safeCents = Math.trunc(cents);
  const sign = safeCents < 0 ? '-' : '';
  const absCents = Math.abs(safeCents);
  const wholePart = Math.floor(absCents / 100);
  const decimalPart = String(absCents % 100).padStart(2, '0');
  return `${sign}${wholePart}.${decimalPart}`;
}
