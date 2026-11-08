import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Table, useToast } from '@izumi/ui';
import type { TableColumn } from '@izumi/ui';
import { canPerform, deliverySchema, whyBlocked } from '@izumi/contracts';
import type { Order } from '@izumi/contracts';
import { ApiError } from '@izumi/api-client';
import { apiClient } from '../../../lib/apiClient';
import { useIdempotentMutation } from '../../../hooks/useIdempotentMutation';

interface Props {
  order: Order;
  onChanged: () => void;
}

type Delivery = Order['deliveries'][number];

/** Cumulative progress plus a client-side guard so a single entry can never exceed what's left. */
export function DeliveriesSection({ order, onChanged }: Props) {
  const toast = useToast();
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [domainError, setDomainError] = useState<string | null>(null);

  const delivered = order.deliveries.reduce((sum, d) => sum + d.quantity, 0);
  const remaining = Math.max(order.quantity - delivered, 0);
  const progressPct = order.quantity > 0 ? Math.min(100, Math.round((delivered / order.quantity) * 100)) : 0;
  const allowed = canPerform(order.status, 'deliver');
  const blockedReason = whyBlocked(order.status, 'deliver');

  const mutation = useIdempotentMutation(
    (input: { quantity: number; reference: string }, key: string) => apiClient.addDelivery(order.id, input, key),
    {
      onSuccess: () => {
        toast.show({ message: 'Entrega registrada.', tone: 'success' });
        setQuantity('');
        setReference('');
        onChanged();
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          if (error.kind === 'invalid_input') {
            setFieldErrors(error.fieldErrors());
          } else {
            setDomainError(error.userMessage());
          }
        } else {
          setDomainError('No pudimos completar la solicitud.');
        }
      },
    },
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setDomainError(null);

    const candidate = { quantity: Number(quantity), reference };
    const result = deliverySchema.safeParse(candidate);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join('.');
        if (key) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    if (result.data.quantity > remaining) {
      setFieldErrors({ quantity: `No puede superar las ${remaining} unidades restantes.` });
      return;
    }
    mutation.mutate(result.data);
  }

  const columns: TableColumn<Delivery>[] = [
    { key: 'quantity', header: 'Cantidad', render: (row) => row.quantity, align: 'right' },
    { key: 'reference', header: 'Referencia', render: (row) => row.reference },
  ];

  return (
    <Card className="order-detail__deliveries">
      <CardHeader title="Entregas" />
      <CardBody>
        <p className="order-detail__hint">
          El seguimiento de entregas por proveedor todavía no está implementado; este total es agregado a nivel de
          pedido.
        </p>

        <div className="order-detail__progress">
          <div
            className="order-detail__progress-bar"
            role="img"
            aria-label={`Entregado: ${delivered} de ${order.quantity} unidades`}
          >
            <span className="order-detail__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p>
            {delivered} / {order.quantity} unidades entregadas
          </p>
        </div>

        <Table
          columns={columns}
          rows={order.deliveries}
          keyExtractor={(row) => `${row.reference}-${row.quantity}`}
          emptyContent={<p>Todavía no hay entregas registradas.</p>}
        />

        {!allowed && blockedReason ? <p className="order-detail__hint">{blockedReason}</p> : null}

        {allowed ? (
          <form onSubmit={handleSubmit} className="order-detail__form" noValidate>
            {domainError ? (
              <Alert tone="warning" title="No se pudo registrar la entrega">
                {domainError}
              </Alert>
            ) : null}
            <Field label="Cantidad" htmlFor="delivery-quantity" required error={fieldErrors.quantity}>
              <Input
                id="delivery-quantity"
                type="number"
                min={1}
                max={remaining}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                error={Boolean(fieldErrors.quantity)}
                required
              />
            </Field>
            <Field label="Referencia" htmlFor="delivery-reference" required error={fieldErrors.reference}>
              <Input
                id="delivery-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                error={Boolean(fieldErrors.reference)}
                required
              />
            </Field>
            <div className="order-detail__form-actions">
              <Button type="submit" loading={mutation.isPending} disabled={remaining <= 0}>
                Registrar entrega
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
