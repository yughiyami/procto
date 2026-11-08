import { useState } from 'react';
import { Button, Card, CardBody, CardHeader, DescriptionList, Modal } from '@izumi/ui';
import { canPerform, formatDateTime, formatPen, whyBlocked } from '@izumi/contracts';
import type { Feasibility, Order } from '@izumi/contracts';
import { QuoteForm } from './QuoteForm';

interface Props {
  order: Order;
  feasibility: Feasibility;
  onChanged: () => void;
}

/** Current quote, plus the button that opens the quote form — gated on status AND feasibility. */
export function QuotePanel({ order, feasibility, onChanged }: Props) {
  const [open, setOpen] = useState(false);

  const statusAllowed = canPerform(order.status, 'quote');
  const allowed = statusAllowed && feasibility.feasible;
  const blockedReason = !statusAllowed
    ? whyBlocked(order.status, 'quote')
    : !feasibility.feasible
      ? 'La combinación actual de aportes todavía no es viable. Resuelve los motivos de la sección de viabilidad antes de cotizar.'
      : null;

  return (
    <Card className="order-detail__quote">
      <CardHeader
        title="Cotización"
        actions={
          <Button size="sm" onClick={() => setOpen(true)} disabled={!allowed}>
            {order.quote ? 'Nueva versión' : 'Cotizar'}
          </Button>
        }
      />
      <CardBody>
        {!allowed && blockedReason ? <p className="order-detail__hint">{blockedReason}</p> : null}

        {order.quote ? (
          <DescriptionList
            items={[
              { key: 'version', term: 'Versión', detail: String(order.quote.version) },
              { key: 'price', term: 'Precio', detail: formatPen(order.quote.priceCents) },
              { key: 'logistics', term: 'Logística', detail: formatPen(order.quote.logisticsCents) },
              { key: 'coordination', term: 'Coordinación', detail: formatPen(order.quote.coordinationCents) },
              { key: 'cost', term: 'Costo total', detail: formatPen(order.quote.costCents) },
              {
                key: 'contribution',
                term: 'Contribución estimada',
                detail: formatPen(order.quote.contributionCents),
              },
              { key: 'validUntil', term: 'Válida hasta', detail: formatDateTime(order.quote.validUntil) },
            ]}
          />
        ) : (
          <p>Este pedido todavía no tiene una cotización.</p>
        )}
      </CardBody>

      <Modal open={open} onClose={() => setOpen(false)} title="Cotizar pedido" size="lg">
        <QuoteForm
          order={order}
          feasibility={feasibility}
          onSuccess={() => {
            setOpen(false);
            onChanged();
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </Card>
  );
}
