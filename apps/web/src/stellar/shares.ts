import type { ChainOrderWithId } from './chain';
import { daysUntil } from './factoring';
import { shareState } from './shareStatus';
import type { OrderStatusName } from './shareStatus';

export type FlatShare = {
  orderId: string;
  index: number;
  status: OrderStatusName;
  deadline: number;
  buyer: string;
  label: string;
  supplier: string;
  owner: string;
  amount: bigint;
  delivered: boolean;
  paid: boolean;
  offerPrice: bigint | undefined;
  state: ReturnType<typeof shareState>;
  daysToDeadline: number;
};

/** Flattens protected orders into one row per payment share, for the workshop and investor views. */
export function flattenShares(orders: ChainOrderWithId[], now = Date.now()): FlatShare[] {
  return orders.flatMap(({ id, order }) =>
    order.shares.map((s, index) => ({
      orderId: id,
      index,
      status: order.status.tag,
      deadline: Number(order.deadline),
      buyer: order.buyer,
      label: s.label,
      supplier: s.supplier,
      owner: s.owner,
      amount: s.amount,
      delivered: s.delivered,
      paid: s.paid,
      offerPrice: s.offer_price ?? undefined,
      state: shareState(s, order.status.tag),
      daysToDeadline: daysUntil(Number(order.deadline), now),
    })),
  );
}

/** Payments an account is owed as the original workshop. */
export const mineAsSupplier = (shares: FlatShare[], address: string) => shares.filter((s) => s.supplier === address);

/** Open advance offers an investor could buy. */
export const openOffers = (shares: FlatShare[], address?: string) =>
  shares.filter((s) => s.status === 'Funded' && !s.paid && s.offerPrice !== undefined && s.owner !== address);

/** Claims an account bought from workshops. */
export const boughtBy = (shares: FlatShare[], address: string) => shares.filter((s) => s.owner === address && s.supplier !== address);
