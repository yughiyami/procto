import type { OrderStatus } from './types.js';

export type OrderAction =
  | 'contribute'
  | 'quote'
  | 'accept'
  | 'deliver'
  | 'movement'
  | 'cancel'
  | 'invite_supplier'
  | 'invite_customer';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'draft',
  'quoted',
  'accepted',
  'fulfilling',
  'delivered',
  'cancelled',
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Borrador',
  quoted: 'Cotizado',
  accepted: 'Aceptado',
  fulfilling: 'En cumplimiento',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

/**
 * Mirrors the "Status → allowed actions" table in docs/frontend-contract.md, which in turn
 * mirrors the `requireCondition` guards in apps/api/src/domain.ts. Kept as data (not scattered
 * ifs) so every screen renders the exact same rule.
 */
const CAN_PERFORM: Record<OrderStatus, Record<OrderAction, boolean>> = {
  draft: {
    contribute: true,
    quote: true,
    accept: false,
    deliver: false,
    movement: false,
    cancel: true,
    invite_supplier: true,
    invite_customer: false,
  },
  quoted: {
    contribute: true,
    quote: true,
    accept: true,
    deliver: false,
    movement: false,
    cancel: true,
    invite_supplier: true,
    invite_customer: true,
  },
  accepted: {
    contribute: false,
    quote: false,
    accept: false,
    deliver: true,
    movement: true,
    cancel: true,
    invite_supplier: false,
    invite_customer: false,
  },
  fulfilling: {
    contribute: false,
    quote: false,
    accept: false,
    deliver: true,
    movement: true,
    cancel: true,
    invite_supplier: false,
    invite_customer: false,
  },
  delivered: {
    contribute: false,
    quote: false,
    accept: false,
    deliver: false,
    movement: true,
    cancel: false,
    invite_supplier: false,
    invite_customer: false,
  },
  cancelled: {
    contribute: false,
    quote: false,
    accept: false,
    deliver: false,
    movement: true,
    cancel: false,
    invite_supplier: false,
    invite_customer: false,
  },
};

export function canPerform(status: OrderStatus, action: OrderAction): boolean {
  return CAN_PERFORM[status][action];
}

const BLOCKED_REASONS: Record<OrderStatus, Partial<Record<OrderAction, string>>> = {
  draft: {
    accept: 'El pedido aún no tiene una cotización activa.',
    deliver: 'El pedido debe estar aceptado antes de registrar entregas.',
    movement: 'El pedido debe estar aceptado antes de registrar movimientos de dinero.',
    invite_customer: 'Genera una cotización antes de invitar al cliente.',
  },
  quoted: {
    deliver: 'El pedido debe estar aceptado antes de registrar entregas.',
    movement: 'El pedido debe estar aceptado antes de registrar movimientos de dinero.',
  },
  accepted: {
    contribute: 'El pedido ya fue aceptado; los aportes quedan bloqueados.',
    quote: 'El pedido ya fue aceptado; no se puede volver a cotizar.',
    invite_supplier: 'El pedido ya fue aceptado; ya no se aceptan más proveedores.',
    invite_customer: 'El pedido ya fue aceptado; la invitación al cliente ya no aplica.',
  },
  fulfilling: {
    contribute: 'El pedido ya fue aceptado; los aportes quedan bloqueados.',
    quote: 'El pedido ya fue aceptado; no se puede volver a cotizar.',
    invite_supplier: 'El pedido ya fue aceptado; ya no se aceptan más proveedores.',
    invite_customer: 'El pedido ya fue aceptado; la invitación al cliente ya no aplica.',
  },
  delivered: {
    contribute: 'El pedido ya fue entregado; los aportes quedan bloqueados.',
    quote: 'El pedido ya fue entregado; no se puede volver a cotizar.',
    accept: 'El pedido ya fue entregado.',
    deliver: 'El pedido ya se entregó por completo.',
    cancel: 'Un pedido entregado no se puede cancelar.',
    invite_supplier: 'El pedido ya fue entregado; ya no se aceptan más proveedores.',
    invite_customer: 'El pedido ya fue entregado; la invitación al cliente ya no aplica.',
  },
  cancelled: {
    contribute: 'El pedido está cancelado; los aportes quedan bloqueados.',
    quote: 'El pedido está cancelado; no se puede cotizar.',
    accept: 'El pedido está cancelado.',
    deliver: 'El pedido está cancelado; no se pueden registrar entregas.',
    cancel: 'El pedido ya está cancelado.',
    invite_supplier: 'El pedido está cancelado; ya no se aceptan más proveedores.',
    invite_customer: 'El pedido está cancelado; la invitación al cliente ya no aplica.',
  },
};

/** Short Spanish explanation for a disabled control, or null when the action is allowed. */
export function whyBlocked(status: OrderStatus, action: OrderAction): string | null {
  if (canPerform(status, action)) return null;
  return BLOCKED_REASONS[status][action] ?? 'Esta acción no está disponible en el estado actual del pedido.';
}
