/** Content of the guided tour. Targets are real UI elements marked with data-tour="..." attributes. */

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Tried in order; the first visible match is highlighted. No match: the card is centered. */
  targets: string[];
};

const t = (name: string) => `[data-tour="${name}"]`;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'problema',
    title: 'Hoy los talleres cobran semanas después',
    body: 'Un pedido grande se reparte entre varios talleres. Pero el comprador paga a los 30 o 60 días, y mientras tanto los talleres financian a la coordinadora con su propio dinero.',
    targets: [t('order-summary')],
  },
  {
    id: 'instruccion',
    title: 'La cotización se vuelve instrucción de pago',
    body: 'Cuando el comprador acepta la cotización, el monto se reparte solo: cada taller y la coordinación ven exactamente cuánto les corresponde.',
    targets: [t('shares'), t('payment-panel')],
  },
  {
    id: 'deposito',
    title: 'El comprador deposita: dinero en garantía',
    body: 'El pago completo queda guardado. Nadie puede usarlo, ni siquiera la coordinadora, hasta que el comprador confirme cada entrega.',
    targets: [t('deposit'), t('payment-panel')],
  },
  {
    id: 'entrega',
    title: 'Cada taller cobra al entregar',
    body: 'El comprador confirma la entrega y el dinero llega directo a la cuenta del taller. Sin esperas y sin intermediarios.',
    targets: [t('shares'), t('payment-panel')],
  },
  {
    id: 'adelanto',
    title: '¿Necesitas el dinero antes? Pide un adelanto',
    body: 'Como el pago ya está depositado, un inversionista puede adelantárselo al taller con un pequeño descuento. Cambia de rol aquí arriba para ver cada punto de vista.',
    targets: [t('role-switch')],
  },
  {
    id: 'comprobante',
    title: 'Cada pago deja un comprobante verificable',
    body: 'Puedes compartirlo con tu banco, tu cliente o tu contador. Cualquiera puede comprobar que el pago ocurrió, sin pedirte permiso.',
    targets: [t('receipt'), t('payment-panel')],
  },
];
