/**
 * "Ficha de cumplimiento": a supplier's reputation computed only from what the contract recorded.
 * The badge is earned by completed payments; it cannot be bought. Pure and unit-tested.
 *
 * On-time delivery: the contract rejects any delivery, confirmation or advance after the order
 * deadline (error "Pasó el plazo del pedido"), so a share that is delivered or paid was handled
 * before its deadline. A refund after the deadline is a missed commitment.
 */

export type ScoredShare = {
  orderId: string;
  supplier: string;
  owner: string;
  amount: bigint;
  delivered: boolean;
  paid: boolean;
  refunded: boolean;
  /** An advance is currently offered for this share. */
  offered: boolean;
};

export type LevelId = 'sin-historial' | 'bronce' | 'plata' | 'oro';

export type Level = {
  id: LevelId;
  label: string;
  /** Plain-language rule shown next to the badge. */
  rule: string;
  minPaid: number;
  minRate: number;
  allowDefaultedAdvance: boolean;
};

export const LEVELS: readonly Level[] = [
  { id: 'sin-historial', label: 'Sin historial', rule: 'Todavía no completó cobros protegidos.', minPaid: 0, minRate: 0, allowDefaultedAdvance: true },
  { id: 'bronce', label: 'Bronce', rule: 'Completó su primer cobro protegido.', minPaid: 1, minRate: 0, allowDefaultedAdvance: true },
  { id: 'plata', label: 'Plata', rule: 'Al menos 3 cobros completados y 90% de cumplimiento.', minPaid: 3, minRate: 0.9, allowDefaultedAdvance: true },
  { id: 'oro', label: 'Oro', rule: 'Al menos 10 cobros completados, 95% de cumplimiento y ningún adelanto incumplido.', minPaid: 10, minRate: 0.95, allowDefaultedAdvance: false },
];

export type SupplierScore = {
  sharesTotal: number;
  ordersCount: number;
  paid: number;
  deliveredOnTime: number;
  /** Shares still in progress (not paid, not refunded). */
  pending: number;
  /** Refunded shares: the commitment was not fulfilled before the deadline. */
  missed: number;
  advancesSold: number;
  advancesHonored: number;
  advancesDefaulted: number;
  volumeUnits: bigint;
  /** paid / (paid + missed); null until at least one commitment is closed. */
  fulfilmentRate: number | null;
  level: Level;
  /** What is missing to reach the next level; null at the top. */
  next: { level: Level; missingPaid: number } | null;
};

function levelFor(paid: number, rate: number | null, defaulted: number): Level {
  let result = LEVELS[0]!;
  for (const level of LEVELS) {
    const rateOk = level.minRate === 0 || (rate !== null && rate >= level.minRate);
    if (paid >= level.minPaid && rateOk && (level.allowDefaultedAdvance || defaulted === 0)) result = level;
  }
  return result;
}

export function scoreSupplier(address: string, shares: ScoredShare[]): SupplierScore {
  const mine = shares.filter((s) => s.supplier === address);
  const paid = mine.filter((s) => s.paid);
  const missed = mine.filter((s) => s.refunded && !s.paid);
  const sold = mine.filter((s) => s.owner !== s.supplier || s.offered);
  const soldToInvestor = mine.filter((s) => s.owner !== s.supplier);
  const closed = paid.length + missed.length;
  const fulfilmentRate = closed === 0 ? null : paid.length / closed;
  const defaulted = soldToInvestor.filter((s) => s.refunded && !s.paid).length;
  const level = levelFor(paid.length, fulfilmentRate, defaulted);
  const nextLevel = LEVELS[LEVELS.findIndex((l) => l.id === level.id) + 1];

  return {
    sharesTotal: mine.length,
    ordersCount: new Set(mine.map((s) => s.orderId)).size,
    paid: paid.length,
    deliveredOnTime: mine.filter((s) => (s.delivered || s.paid) && !(s.refunded && !s.paid)).length,
    pending: mine.filter((s) => !s.paid && !s.refunded).length,
    missed: missed.length,
    advancesSold: sold.length,
    advancesHonored: soldToInvestor.filter((s) => s.paid || s.delivered).length,
    advancesDefaulted: defaulted,
    volumeUnits: paid.reduce((t, s) => t + s.amount, 0n),
    fulfilmentRate,
    level,
    next: nextLevel ? { level: nextLevel, missingPaid: Math.max(0, nextLevel.minPaid - paid.length) } : null,
  };
}
