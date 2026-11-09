import type { Order, Supplier } from '@izumi/contracts';
import { COMMISSION_LABEL, IMPACT_LABEL, splitCommission } from './commission';
import { PLATFORM_ACCOUNTS } from './platform';

export const COORDINATOR_LABEL = 'Coordinación y producción propia';
const DAY = 86_400;

export type ShareKind = 'workshop' | 'coordinator' | 'platform' | 'impact';

export type ShareDraft = {
  /** Local supplier id, or null for every share that is not a workshop's. */
  supplierId: string | null;
  kind: ShareKind;
  label: string;
  amountCents: number;
  /** Fixed account for platform shares (treasury, impact fund); workshops and the coordinator choose theirs. */
  address?: string;
};

export type BuildSharesOptions = {
  /** Adds the PROCTO commission (and the impact fund share) taken out of the coordinator's remainder. */
  commission?: { pro: boolean };
};

/**
 * The accepted quote is the payment instruction: every supplier gets exactly
 * quantity x unit cost of their contributions; the coordinator keeps the
 * remainder (own production, logistics, coordination and margin). Shares always
 * add up to the quote price.
 */
export function buildShares(order: Order, suppliers: Supplier[], options: BuildSharesOptions = {}): ShareDraft[] {
  if (!order.quote || !order.accepted) {
    throw new Error('El pedido debe tener una cotización aceptada para activar el cobro protegido.');
  }
  const perSupplier = new Map<string, number>();
  for (const c of order.contributions) {
    perSupplier.set(c.supplierId, (perSupplier.get(c.supplierId) ?? 0) + c.quantity * c.unitCostCents);
  }
  const drafts: ShareDraft[] = [];
  let supplierTotal = 0;
  for (const [supplierId, amountCents] of perSupplier) {
    if (amountCents <= 0) continue;
    const name = suppliers.find((s) => s.id === supplierId)?.name ?? 'Proveedor';
    drafts.push({ supplierId, kind: 'workshop', label: name, amountCents });
    supplierTotal += amountCents;
  }
  const remainder = order.quote.priceCents - supplierTotal;
  if (remainder <= 0) {
    throw new Error('Los costos de los proveedores superan el precio de la cotización.');
  }
  if (!options.commission) {
    drafts.push({ supplierId: null, kind: 'coordinator', label: COORDINATOR_LABEL, amountCents: remainder });
    return drafts;
  }
  const split = splitCommission(order.quote.priceCents, options.commission.pro);
  if (remainder - split.commissionCents <= 0) {
    throw new Error('La comisión de PROCTO no cabe en el margen de la coordinación. Revisa la cotización.');
  }
  drafts.push({ supplierId: null, kind: 'coordinator', label: COORDINATOR_LABEL, amountCents: remainder - split.commissionCents });
  if (split.treasuryCents > 0) {
    drafts.push({ supplierId: null, kind: 'platform', label: COMMISSION_LABEL, amountCents: split.treasuryCents, address: PLATFORM_ACCOUNTS.treasury });
  }
  if (split.impactCents > 0) {
    drafts.push({ supplierId: null, kind: 'impact', label: IMPACT_LABEL, amountCents: split.impactCents, address: PLATFORM_ACCOUNTS.impact });
  }
  return drafts;
}

/** Unix seconds: due date plus a 7-day grace, never earlier than 7 days from now. */
export function suggestDeadline(dueAtIso: string, now = Date.now()): number {
  const graceEnd = Math.floor(Date.parse(dueAtIso) / 1000) + 7 * DAY;
  const minimum = Math.floor(now / 1000) + 7 * DAY;
  return Math.max(graceEnd, minimum);
}
