import { Alert, Badge, Card, CardBody, CardHeader, Stepper } from '@izumi/ui';
import type { BadgeProps, StepperStep } from '@izumi/ui';
import { STATUS_LABELS, formatDateTime, formatPen } from '@izumi/contracts';
import type { Order, OrderStatus } from '@izumi/contracts';

const LIFECYCLE_STEPS: StepperStep[] = [
  { key: 'draft', label: STATUS_LABELS.draft },
  { key: 'quoted', label: STATUS_LABELS.quoted },
  { key: 'accepted', label: STATUS_LABELS.accepted },
  { key: 'fulfilling', label: STATUS_LABELS.fulfilling },
  { key: 'delivered', label: STATUS_LABELS.delivered },
];

const STATUS_TONE: Record<OrderStatus, BadgeProps['tone']> = {
  draft: 'neutral',
  quoted: 'info',
  accepted: 'success',
  fulfilling: 'info',
  delivered: 'success',
  cancelled: 'danger',
};

interface Props {
  order: Order;
}

/** Title, status, and lifecycle progress — the page's at-a-glance orientation block. */
export function OrderSummary({ order }: Props) {
  const isCancelled = order.status === 'cancelled';
  const stepperState = isCancelled
    ? Object.fromEntries(LIFECYCLE_STEPS.map((step) => [step.key, 'cancelled' as const]))
    : undefined;

  return (
    <Card className="order-detail__summary" data-tour="order-summary">
      <CardHeader
        title={order.title}
        actions={<Badge tone={STATUS_TONE[order.status]}>{STATUS_LABELS[order.status]}</Badge>}
      />
      <CardBody>
        <dl className="order-detail__summary-grid">
          <div>
            <dt>Cantidad solicitada</dt>
            <dd>{order.quantity} unidades</dd>
          </div>
          <div>
            <dt>Fecha límite</dt>
            <dd>{formatDateTime(order.dueAt)}</dd>
          </div>
          <div>
            <dt>Aporte propio</dt>
            <dd>
              {order.ownQuantity} unidades · {formatPen(order.ownCostCents)}
            </dd>
          </div>
          <div className="order-detail__summary-spec">
            <dt>Especificación</dt>
            <dd>{order.specification}</dd>
          </div>
        </dl>

        {isCancelled ? (
          <Alert tone="danger" title="Pedido cancelado">
            El flujo operativo quedó detenido. Solo se pueden registrar movimientos de dinero desde este punto.
          </Alert>
        ) : null}

        <Stepper
          steps={LIFECYCLE_STEPS}
          currentKey={isCancelled ? 'draft' : order.status}
          state={stepperState}
        />
      </CardBody>
    </Card>
  );
}
