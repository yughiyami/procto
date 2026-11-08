/**
 * Browser port of apps/api/src/domain.ts. Same rules, same hash-chained audit
 * events, but async (WebCrypto) and with Spanish user-facing messages. Mutates
 * the order in place, exactly like the original.
 */
import {
  contributionSchema,
  createOrderSchema,
  deliverySchema,
  movementSchema,
  quoteSchema,
} from '@izumi/contracts';
import type { DomainEvent, Feasibility, Finance, Order } from '@izumi/contracts';
import { randomHex, randomId, sha256Hex } from './hash';

export class DomainError extends Error {}

function requireCondition(ok: unknown, message: string): asserts ok {
  if (!ok) throw new DomainError(message);
}

export async function record(o: Order, type: string, actor: string, data: unknown): Promise<void> {
  const previousHash = o.events.at(-1)?.hash ?? '';
  const event = {
    id: randomId(),
    type,
    at: new Date().toISOString(),
    actor,
    data,
    salt: randomHex(32),
    previousHash,
  };
  const hash = await sha256Hex(JSON.stringify(event));
  o.events.push({ ...event, hash });
  o.version++;
}

export async function createOrder(raw: unknown, actor: string): Promise<Order> {
  const v = createOrderSchema.parse(raw);
  requireCondition(v.ownQuantity <= v.quantity, 'La cantidad propia supera la cantidad solicitada.');
  requireCondition(Date.parse(v.dueAt) > Date.now(), 'La fecha de entrega debe estar en el futuro.');
  const o: Order = {
    ...v,
    id: randomId(),
    status: 'draft',
    version: 0,
    contributions: [],
    deliveries: [],
    movements: [],
    events: [],
  };
  await record(o, 'request.created', actor, v);
  return o;
}

export async function addContribution(o: Order, raw: unknown, actor: string): Promise<void> {
  requireCondition(['draft', 'quoted'].includes(o.status), 'El pedido está bloqueado tras la aceptación.');
  const c = contributionSchema.parse(raw);
  requireCondition(Date.parse(c.validUntil) > Date.now(), 'El compromiso del proveedor venció.');
  const existing = o.contributions.findIndex((x) => x.supplierId === c.supplierId);
  const prior = existing < 0 ? undefined : o.contributions[existing];
  const entry = { ...c, id: prior?.id ?? randomId() };
  if (prior === undefined) o.contributions.push(entry);
  else o.contributions[existing] = entry;
  o.quote = undefined;
  o.status = 'draft';
  await record(o, 'contribution.updated', actor, entry);
}

export function feasibility(o: Order, now = Date.now()): Feasibility {
  const reasons: string[] = [];
  let total = o.ownQuantity;
  let cost = o.ownCostCents;
  for (const c of o.contributions) {
    if (!c.confirmed) reasons.push(`Unconfirmed: ${c.supplierId}`);
    if (c.specification !== o.specification) reasons.push(`Specification mismatch: ${c.supplierId}`);
    if (Date.parse(c.availableAt) > Date.parse(o.dueAt)) reasons.push(`Late: ${c.supplierId}`);
    if (Date.parse(c.validUntil) <= now) reasons.push(`Expired: ${c.supplierId}`);
    total += c.quantity;
    cost += c.quantity * c.unitCostCents;
  }
  if (total !== o.quantity) reasons.push(`Allocated ${total}, required ${o.quantity}`);
  return { feasible: reasons.length === 0, reasons, totalQuantity: total, costCents: cost };
}

export async function quoteOrder(o: Order, raw: unknown, actor: string): Promise<void> {
  requireCondition(['draft', 'quoted'].includes(o.status), 'El pedido está bloqueado.');
  const v = quoteSchema.parse(raw);
  const check = feasibility(o);
  requireCondition(check.feasible, check.reasons.join('; '));
  requireCondition(Date.parse(v.validUntil) > Date.now(), 'La cotización venció.');
  requireCondition(Date.parse(v.validUntil) <= Date.parse(o.dueAt), 'La cotización vence después de la entrega.');
  requireCondition(
    o.contributions.every((c) => Date.parse(c.validUntil) >= Date.parse(v.validUntil)),
    'La cotización dura más que el compromiso de un proveedor.',
  );
  const cost = check.costCents + v.logisticsCents + v.coordinationCents;
  o.quote = { ...v, version: o.version + 1, costCents: cost, contributionCents: v.priceCents - cost };
  o.status = 'quoted';
  await record(o, 'quote.created', actor, o.quote);
}

export async function acceptOrder(o: Order, version: number, actor: string): Promise<void> {
  requireCondition(o.status === 'quoted' && o.quote, 'No hay una cotización activa.');
  requireCondition(o.quote.version === version, 'La versión de la cotización cambió.');
  requireCondition(Date.parse(o.quote.validUntil) > Date.now(), 'La cotización venció.');
  const f = feasibility(o);
  requireCondition(f.feasible, f.reasons.join('; '));
  o.accepted = { version, at: new Date().toISOString(), actor };
  o.status = 'accepted';
  await record(o, 'quote.accepted', actor, o.accepted);
}

export async function deliverOrder(o: Order, raw: unknown, actor: string): Promise<void> {
  requireCondition(['accepted', 'fulfilling'].includes(o.status), 'El pedido aún no fue aceptado.');
  const d = deliverySchema.parse(raw);
  const total = o.deliveries.reduce((s, x) => s + x.quantity, 0) + d.quantity;
  requireCondition(total <= o.quantity, 'La entrega supera la cantidad del pedido.');
  o.deliveries.push(d);
  o.status = total === o.quantity ? 'delivered' : 'fulfilling';
  await record(o, 'delivery.recorded', actor, d);
}

export async function addMovement(o: Order, raw: unknown, actor: string): Promise<void> {
  requireCondition(
    ['accepted', 'fulfilling', 'delivered', 'cancelled'].includes(o.status),
    'Acepta el pedido antes de registrar dinero.',
  );
  const m = { ...movementSchema.parse(raw), id: randomId() };
  requireCondition(!o.movements.some((x) => x.reference === m.reference), 'La referencia del movimiento ya existe.');
  o.movements.push(m);
  await record(o, 'money.recorded', actor, m);
}

export async function cancelOrder(o: Order, actor: string): Promise<void> {
  requireCondition(!['delivered', 'cancelled'].includes(o.status), 'No se puede cancelar este pedido.');
  o.status = 'cancelled';
  await record(o, 'order.cancelled', actor, {
    note: 'Supplier release and refunds require human follow-up; no automatic money movement',
  });
}

export async function verifyEvidence(events: DomainEvent[]): Promise<boolean> {
  let previous = '';
  for (const e of events) {
    const { hash, ...body } = e;
    if (e.previousHash !== previous || (await sha256Hex(JSON.stringify(body))) !== hash) return false;
    previous = hash;
  }
  return true;
}

export function finance(o: Order): Finance {
  let receipts = 0;
  let paid = 0;
  for (const m of o.movements) {
    if (m.kind === 'customer_receipt') receipts += m.amountCents;
    else if (m.kind === 'customer_refund') receipts -= m.amountCents;
    else paid += m.amountCents;
  }
  return {
    currency: 'PEN',
    receivedNetCents: receipts,
    paidCostsCents: paid,
    cashDifferenceCents: receipts - paid,
    estimatedContributionCents: o.quote?.contributionCents ?? null,
    customerBalanceCents: o.quote ? o.quote.priceCents - receipts : null,
    warning:
      'La diferencia de caja no es utilidad: es solo cobros menos pagos registrados. La verificación es manual, no una conciliación bancaria.',
  };
}
