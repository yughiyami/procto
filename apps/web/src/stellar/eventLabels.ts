/** Plain-language names for the contract's events (the network calls them by technical names). */
export const EVENT_LABELS: Record<string, string> = {
  order_created: 'Se activó el cobro protegido',
  order_funded: 'El comprador depositó el pago',
  share_delivered: 'Un taller avisó su entrega',
  share_paid: 'Se pagó a un taller',
  order_completed: 'Pedido pagado por completo',
  share_offered: 'Un taller pidió un adelanto',
  offer_cancelled: 'Se canceló un adelanto',
  share_sold: 'Un inversionista adelantó el pago',
  order_refunded: 'Se devolvió el dinero al comprador',
};

export const TX_LABELS: Record<string, string> = {
  create_order: 'Activación del cobro protegido',
  fund: 'Depósito del pago',
  mark_delivered: 'Aviso de entrega del taller',
  confirm_delivery: 'Confirmación de entrega y pago',
  offer_share: 'Pedido de adelanto',
  buy_share: 'Adelanto financiado',
  cancel_offer: 'Adelanto cancelado',
  refund_expired: 'Devolución por plazo vencido',
};
