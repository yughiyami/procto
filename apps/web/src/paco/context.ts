/** Builds the compact context PACO receives with each question. Pure; unit-tested. */
import type { Order } from '@izumi/contracts';
import type { Role } from '../session/SessionContext';
import { shareState } from '../stellar/shareStatus';
import type { OrderStatusName, ShareLike } from '../stellar/shareStatus';
import { tokenUnitsToPenCents } from '../stellar/units';
import type { PacoContext } from './guidance';

export type ChainShareView = ShareLike & { label: string; amount: bigint };

export type PacoInput = {
  role: Role;
  pro: boolean;
  businessName?: string;
  orders: Order[];
  /** The order the person is looking at and its live state, when a protected payment exists. */
  active?: { order: Order; status: OrderStatusName; shares: ChainShareView[] };
};

export function buildPacoContext(input: PacoInput): PacoContext {
  const payment = input.active
    ? {
        orderTitle: input.active.order.title,
        phase: input.active.status,
        totalCents: input.active.shares.reduce((t, s) => t + tokenUnitsToPenCents(s.amount), 0),
        deliveredUnpaid: input.active.shares.filter((s) => !s.paid && !s.refunded && s.delivered).length,
        waitingDelivery: input.active.shares.filter((s) => !s.paid && !s.refunded && !s.delivered && s.offer_price == null).length,
        offered: input.active.shares.filter((s) => !s.paid && s.offer_price != null).length,
        shares: input.active.shares.map((s) => ({
          label: s.label,
          amountCents: tokenUnitsToPenCents(s.amount),
          state: shareState(s, input.active!.status).label,
        })),
      }
    : null;
  return {
    role: input.role,
    pro: input.pro,
    businessName: input.businessName || undefined,
    orders: input.orders.slice(0, 5).map((o) => ({
      title: o.title,
      status: o.status,
      priceCents: o.quote?.priceCents ?? null,
      accepted: Boolean(o.accepted),
    })),
    payment,
  };
}
