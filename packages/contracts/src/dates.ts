/**
 * The server validates every date field with `z.iso.datetime()`, which (with no options)
 * requires a UTC string ending in "Z" — not an arbitrary offset. So `toIsoWithOffset` below
 * converts a local wall-clock value (from `<input type="datetime-local">`, which carries no
 * timezone) into that canonical UTC/"Z" ISO form rather than embedding the browser's own offset.
 */

/** Converts a `datetime-local` input value (local wall-clock, no timezone) into a UTC ISO 8601 string. */
export function toIsoWithOffset(localDateTimeValue: string): string | null {
  if (!localDateTimeValue) return null;
  const date = new Date(localDateTimeValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Converts a UTC ISO 8601 string back into a `datetime-local` input value in the viewer's local time. */
export function fromIsoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
const dateFormatter = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' });

/** Formats an ISO 8601 string as a localized date + time for display, e.g. "5 sept 2026, 2:30 p.m.". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateTimeFormatter.format(date);
}

/** Formats an ISO 8601 string as a localized date for display, e.g. "5 sept 2026". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormatter.format(date);
}

/** True when the given ISO 8601 instant is strictly after now. */
export function isFuture(iso: string): boolean {
  const time = Date.parse(iso);
  return !Number.isNaN(time) && time > Date.now();
}

/** Returns a UTC ISO 8601 string `n` days from now (fractional days allowed). */
export function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}
