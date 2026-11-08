import type { Order, Supplier } from '@izumi/contracts';

export const COORDINATOR_LABEL = 'Coordinación y producción propia';
const DAY = 86_400;

export type ShareDraft = {
  /** Local supplier id, or null for the coordinator's own share. */
  supplierId: string | null;
  label: string;
  amountCents: number;
};

/**
 * The accepted quote is the payment instruction: every supplier gets exactly
 * quantity x unit cost of their contributions; the coordinator keeps the
 * remainder (own production, logistics, coordination and margin). Shares always
 * add up to the quote price.
 */
export function buildShares(order: Order, suppliers: Supplier[]): ShareDraft[] {
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
    drafts.push({ supplierId, label: name, amountCents });
    supplierTotal += amountCents;
  }
  const remainder = order.quote.priceCents - supplierTotal;
  if (remainder <= 0) {
    throw new Error('Los costos de los proveedores superan el precio de la cotización.');
  }
  drafts.push({ supplierId: null, label: COORDINATOR_LABEL, amountCents: remainder });
  return drafts;
}

/** Unix seconds: due date plus a 7-day grace, never earlier than 7 days from now. */
export function suggestDeadline(dueAtIso: string, now = Date.now()): number {
  const graceEnd = Math.floor(Date.parse(dueAtIso) / 1000) + 7 * DAY;
  const minimum = Math.floor(now / 1000) + 7 * DAY;
  return Math.max(graceEnd, minimum);
}
