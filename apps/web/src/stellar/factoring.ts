const DAY = 86_400;
/** Advance paid to a workshop as a share of the claim (suggested default). */
export const DEFAULT_ADVANCE_RATIO = 0.96;

export function suggestAdvancePrice(amount: bigint): bigint {
  return (amount * 96n) / 100n;
}

/** Whole days from now until a unix-seconds deadline, at least 1. */
export function daysUntil(deadlineSeconds: number, now = Date.now()): number {
  const days = Math.ceil((deadlineSeconds - now / 1000) / DAY);
  return Math.max(1, days);
}

export type AdvanceQuote = {
  /** Discount the workshop accepts, in percent. */
  discountPct: number;
  /** What the investor earns when the order pays (amount - price). */
  profit: bigint;
  /** Return over the holding period (amount/price - 1). */
  periodRate: number;
  /** Compounded annualised effective rate. */
  annualRate: number;
};

export function advanceQuote(input: { amount: bigint; price: bigint; days: number }): AdvanceQuote {
  const { amount, price, days } = input;
  if (price <= 0n || price > amount) throw new Error('El precio del adelanto debe ser mayor que 0 y no superar el monto.');
  const periodRate = Number(amount) / Number(price) - 1;
  const annualRate = Math.pow(1 + periodRate, 365 / Math.max(1, days)) - 1;
  return {
    discountPct: (1 - Number(price) / Number(amount)) * 100,
    profit: amount - price,
    periodRate,
    annualRate,
  };
}
