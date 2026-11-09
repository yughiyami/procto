/**
 * Role-aware hint for the "Cobro protegido" panel: who acts next and what they do.
 * Pure and unit-tested; the panel only renders the result.
 */
import type { Role } from '../session/SessionContext';

export type PaymentPhase = 'inactive' | 'Created' | 'Funded' | 'Completed' | 'Refunded' | 'PartiallyRefunded';

export type PaymentContext = {
  phase: PaymentPhase;
  /** Shares not yet paid that the workshop has marked as delivered. */
  deliveredUnpaid: number;
  /** Shares not yet paid, not delivered and not offered for an advance. */
  waitingDelivery: number;
  /** Shares currently offered to investors. */
  offered: number;
};

export type NextAction = {
  /** True when the active role is the one that acts now. */
  mine: boolean;
  /** Who acts now (null when nobody has to). */
  actor: Role | null;
  action: string;
  detail: string;
};

const ACTOR_LABEL: Record<Role, string> = {
  coordinadora: 'la Coordinadora',
  comprador: 'el Comprador',
  proveedor: 'el Proveedor',
  inversionista: 'el Inversionista',
};
export const actorLabel = (role: Role): string => ACTOR_LABEL[role];

const act = (role: Role, actor: Role, action: string, detail: string): NextAction => ({ mine: role === actor, actor, action, detail });

export function nextAction(role: Role, ctx: PaymentContext): NextAction {
  switch (ctx.phase) {
    case 'inactive':
      return act(role, 'comprador', 'Activar cobro protegido', 'Con la cotización aceptada, el comprador crea el cobro y se reparte el pago.');
    case 'Created':
      return act(role, 'comprador', 'Depositar pago', 'El dinero queda en garantía hasta que se confirme cada entrega.');
    case 'Funded': {
      if (role === 'comprador') {
        return ctx.deliveredUnpaid > 0
          ? act(role, 'comprador', 'Confirmar entrega y pagar', 'Un taller avisó que entregó: confirma y su pago sale al instante.')
          : { mine: false, actor: 'proveedor', action: 'Avisar su entrega o pedir un adelanto', detail: 'Cuando un taller avise su entrega podrás confirmarla y pagar.' };
      }
      if (role === 'proveedor') {
        return ctx.waitingDelivery > 0
          ? act(role, 'proveedor', 'Marcar como entregado o pedir un adelanto', 'Entra a Mis cobros: puedes avisar tu entrega o cobrar hoy con un pequeño descuento.')
          : { mine: false, actor: 'comprador', action: 'Confirmar la entrega y pagar', detail: 'Tu entrega ya está avisada o tu adelanto ya fue pedido.' };
      }
      if (role === 'inversionista') {
        return ctx.offered > 0
          ? act(role, 'inversionista', 'Comprar un adelanto', 'Hay pagos ya depositados que un taller quiere cobrar hoy.')
          : { mine: false, actor: 'proveedor', action: 'Pedir un adelanto', detail: 'Cuando un taller pida un adelanto aparecerá en Adelantos.' };
      }
      return { mine: false, actor: 'comprador', action: 'Confirmar entregas y pagar', detail: 'Los talleres entregan y tú sigues el avance.' };
    }
    case 'Completed':
      return { mine: false, actor: null, action: 'Pedido pagado', detail: 'Todos cobraron. Revisa el comprobante verificable.' };
    case 'Refunded':
    case 'PartiallyRefunded':
      return { mine: false, actor: null, action: 'Pago devuelto', detail: 'El plazo venció y el dinero volvió al comprador.' };
  }
}

/** Headline text: "Ahora te toca: X" or "Ahora le toca a el Comprador: X". */
export function hintTitle(role: Role, a: NextAction): string {
  if (a.actor === null) return a.action;
  if (a.mine) return `Ahora te toca: ${a.action}`;
  return `Ahora le toca ${actorLabel(a.actor).replace(/^la /, 'a la ').replace(/^el /, 'al ')}: ${a.action}`;
}
