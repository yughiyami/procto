/** Accept common pasted formatting, but never guess a country or strip letters. */
export function normalizeContactPhone(value: string): string {
  return value.trim().replace(/[\s().-]/g, '');
}

export function validContactPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizeContactPhone(value));
}
