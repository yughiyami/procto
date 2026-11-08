/** Plain-language state of a payment share and of a protected order. Pure; unit-tested. */

export type OrderStatusName = 'Created' | 'Funded' | 'Completed' | 'Refunded' | 'PartiallyRefunded';

export type ShareLike = {
  paid: boolean;
  refunded: boolean;
  delivered: boolean;
  offer_price?: bigint | undefined;
};

export type ShareStateKey = 'pending' | 'escrow' | 'delivered' | 'offered' | 'paid' | 'refunded';

export function shareState(share: ShareLike, status: OrderStatusName): { key: ShareStateKey; label: string } {
  if (share.paid) return { key: 'paid', label: 'Pagado' };
  if (share.refunded) return { key: 'refunded', label: 'Devuelto al comprador' };
  if (status === 'Created') return { key: 'pending', label: 'Pendiente de depósito' };
  if (share.offer_price !== undefined) return { key: 'offered', label: 'Adelanto ofrecido' };
  if (share.delivered) return { key: 'delivered', label: 'Entrega avisada, falta confirmar' };
  return { key: 'escrow', label: 'En depósito en garantía' };
}

export function orderPhase(status: OrderStatusName): { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' } {
  switch (status) {
    case 'Created':
      return { label: 'Cobro protegido activado, falta el depósito', tone: 'warning' };
    case 'Funded':
      return { label: 'Pago depositado en garantía', tone: 'info' };
    case 'Completed':
      return { label: 'Pago completo', tone: 'success' };
    case 'Refunded':
      return { label: 'Pago devuelto al comprador', tone: 'neutral' };
    case 'PartiallyRefunded':
      return { label: 'Pago parcialmente devuelto', tone: 'neutral' };
  }
}
