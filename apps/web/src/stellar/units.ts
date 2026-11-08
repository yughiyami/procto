/**
 * Money conversion between the app's integer PEN cents and the 7-decimal token
 * units of the Stellar assets (USDC / demo PUSD).
 *
 * DEMO RATE: a fixed S/ 3.75 per 1 USD token. This is a demonstration constant,
 * NOT a market rate. In production the rate would come from the quote's own
 * agreed currency or an oracle / anchor quote (SEP-38).
 */
export const DEMO_FX_PEN_PER_USD = 3.75;
export const TOKEN_DECIMALS = 7;

const UNITS_PER_TOKEN = 10_000_000n;
// 3.75 PEN/USD expressed as an exact rational: 375 / 100.
const FX_NUM = 375n;
const FX_DEN = 100n;

/** PEN cents -> token units (7 decimals), rounded half up. */
export function penCentsToTokenUnits(cents: number): bigint {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('El monto debe ser un número entero de céntimos, mayor o igual a 0.');
  // units = cents/100 PEN / fx PEN-per-USD * 1e7 = cents * 1e7 * FX_DEN / (100 * FX_NUM)
  const num = BigInt(cents) * UNITS_PER_TOKEN * FX_DEN;
  const den = 100n * FX_NUM;
  return (num * 2n + den) / (den * 2n);
}

/** Token units -> PEN cents, rounded half up. */
export function tokenUnitsToPenCents(units: bigint): number {
  if (units < 0n) throw new Error('El monto no puede ser negativo.');
  const num = units * 100n * FX_NUM;
  const den = UNITS_PER_TOKEN * FX_DEN;
  return Number((num * 2n + den) / (den * 2n));
}

/** "1,234.57" for display (2 decimals, es-neutral thousands separator). */
export function formatToken(units: bigint): string {
  const cents = (units * 100n * 2n + UNITS_PER_TOKEN) / (UNITS_PER_TOKEN * 2n);
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, '0');
  return `${whole.toLocaleString('en-US')}.${frac}`;
}
