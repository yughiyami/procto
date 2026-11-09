/**
 * PACO's scripted guidance and request context. Used by the serverless function as the fallback
 * when the AI gateway is unavailable, and by the browser when the function cannot be reached.
 * Pure, framework-free and unit-tested. Plain Spanish, no technical jargon.
 */
import { hintTitle, nextAction } from '../tour/nextAction.js';
import type { PaymentPhase } from '../tour/nextAction.js';
import type { Role } from '../session/SessionContext.js';
import { commissionRateBps } from '../stellar/commission.js';

export type PacoContext = {
  role: Role;
  pro: boolean;
  businessName?: string;
  orders: Array<{ title: string; status: string; priceCents: number | null; accepted: boolean }>;
  payment: null | {
    orderTitle: string;
    phase: PaymentPhase;
    totalCents: number;
    deliveredUnpaid: number;
    waitingDelivery: number;
    offered: number;
    shares: Array<{ label: string; amountCents: number; state: string }>;
  };
};

const ROLES: Role[] = ['coordinadora', 'comprador', 'proveedor', 'inversionista'];
const PHASES: PaymentPhase[] = ['inactive', 'Created', 'Funded', 'Completed', 'Refunded', 'PartiallyRefunded'];
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(Math.trunc(v), 1e12)) : 0);

/** Never trust the client: keeps only known fields, caps sizes and drops everything else. */
export function sanitizeContext(raw: unknown): PacoContext {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const role = ROLES.find((r) => r === o.role) ?? 'comprador';
  const orders = (Array.isArray(o.orders) ? o.orders : []).slice(0, 5).map((x) => {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return {
      title: text(r.title, 120),
      status: text(r.status, 30),
      priceCents: typeof r.priceCents === 'number' ? num(r.priceCents) : null,
      accepted: r.accepted === true,
    };
  });
  const p = o.payment && typeof o.payment === 'object' ? (o.payment as Record<string, unknown>) : null;
  const payment = p
    ? {
        orderTitle: text(p.orderTitle, 120),
        phase: PHASES.find((ph) => ph === p.phase) ?? 'inactive',
        totalCents: num(p.totalCents),
        deliveredUnpaid: num(p.deliveredUnpaid),
        waitingDelivery: num(p.waitingDelivery),
        offered: num(p.offered),
        shares: (Array.isArray(p.shares) ? p.shares : []).slice(0, 12).map((s) => {
          const r = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
          return { label: text(r.label, 80), amountCents: num(r.amountCents), state: text(r.state, 60) };
        }),
      }
    : null;
  return { role, pro: o.pro === true, businessName: text(o.businessName, 80) || undefined, orders, payment };
}

const pen = (cents: number) => `S/ ${(cents / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TOPICS = '¿Cómo pido un adelanto?, ¿cuánto cobra PROCTO? o ¿dónde veo el comprobante?';

export function scriptedAnswer(question: string, ctx: PacoContext): string {
  const q = question.toLowerCase();
  const action = nextAction(ctx.role, {
    phase: ctx.payment?.phase ?? 'inactive',
    deliveredUnpaid: ctx.payment?.deliveredUnpaid ?? 0,
    waitingDelivery: ctx.payment?.waitingDelivery ?? 0,
    offered: ctx.payment?.offered ?? 0,
  });
  const next = `${hintTitle(ctx.role, action)}. ${action.detail}`;

  if (/adelanto|cobrar antes|cobrar hoy|inversion/.test(q)) {
    return 'Un adelanto sirve cuando el taller necesita el dinero antes de que el comprador confirme la entrega. Como el pago ya está depositado en garantía, un inversionista se lo compra al taller con un pequeño descuento (por ejemplo, el 96% del monto) y el taller cobra hoy. Cuando el comprador confirma la entrega, el pago le llega al inversionista. El taller lo pide desde Mis cobros.';
  }
  if (/comisi|cu[aá]nto cobra|tarifa|procto cobra|pro\b|reforest|impacto|prisma/.test(q)) {
    const rate = commissionRateBps(ctx.pro) / 100;
    return `PROCTO cobra ${rate}% de la venta cerrada${ctx.pro ? ' (tarifa PRO)' : ' (con una cuenta PRO baja a 2%)'}, solo cuando el pedido se cobra, y sale de la parte de la coordinadora: los talleres cobran lo mismo. El 8% de esa comisión va a un fondo de reforestación y comunidades andinas.${ctx.payment ? ` En este pedido de ${pen(ctx.payment.totalCents)}, la comisión es de ${pen(Math.floor((ctx.payment.totalCents * commissionRateBps(ctx.pro)) / 10_000))}.` : ''}`;
  }
  if (/comprobante|verific|prueba|constancia/.test(q)) {
    return 'Cada pago deja un comprobante público que cualquiera puede revisar sin pedirte permiso. Lo encuentras en el pedido, en "Ver comprobante verificable". Puedes compartir el enlace con tu banco, tu cliente o tu contador.';
  }
  if (/ficha|reputaci|insignia|cumplimiento/.test(q)) {
    return 'La ficha de cumplimiento muestra el historial real de un taller: cobros completados, entregas a tiempo y adelantos cumplidos. La insignia (Bronce, Plata u Oro) se gana con ese historial; no se compra. Cada taller tiene su enlace para compartirla.';
  }
  if (/dep[oó]sit|garant|segur|confiar/.test(q)) {
    return 'Cuando el comprador deposita, el dinero queda en garantía: nadie puede usarlo, ni la coordinadora, hasta que se confirme cada entrega. Si el plazo vence sin entrega, el dinero vuelve al comprador.';
  }
  if (!ctx.payment && /(qu[eé] hago|siguiente|ahora|toca|empez|c[oó]mo funciona)/.test(q)) {
    return 'Todavía no hay un cobro protegido. Primero el comprador acepta la cotización del pedido y luego activa el cobro: ahí el pago se reparte solo entre los talleres y la coordinación.';
  }
  if (/(qu[eé] hago|siguiente|ahora|toca|paso)/.test(q)) return next;
  return `${next}\n\nTambién puedo explicarte: ${TOPICS}`;
}
