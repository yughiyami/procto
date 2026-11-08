import { useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, ConfirmDialog, DescriptionList, useToast } from '@izumi/ui';
import { formatDateTime } from '@izumi/contracts';
import type { Order } from '@izumi/contracts';
import { ApiError } from '@izumi/api-client';
import { apiClient } from '../../../lib/apiClient';
import { useIdempotentMutation } from '../../../hooks/useIdempotentMutation';

interface Props {
  order: Order;
  onChanged: () => void;
}

/**
 * Sends the current `order.quote.version` — never a hardcoded number. A stale version is
 * exactly the case the server's `acceptOrder` rejects with 409 ("Stale quote version").
 */
export function AcceptancePanel({ order, onChanged }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  const mutation = useIdempotentMutation((version: number, key: string) => apiClient.acceptQuote(order.id, version, key), {
    onSuccess: () => {
      toast.show({ message: 'Cotización aceptada.', tone: 'success' });
      setOpen(false);
      onChanged();
    },
    onError: (error) => {
      setDomainError(error instanceof ApiError ? error.userMessage() : 'No pudimos completar la solicitud.');
    },
  });

  if (!order.quote && !order.accepted) return null;

  return (
    <Card className="order-detail__acceptance">
      <CardHeader title="Aceptación" />
      <CardBody>
        {domainError ? (
          <Alert tone="warning" title="No se pudo aceptar la cotización">
            {domainError}
          </Alert>
        ) : null}

        {order.accepted ? (
          <DescriptionList
            items={[
              { key: 'version', term: 'Versión aceptada', detail: String(order.accepted.version) },
              { key: 'at', term: 'Fecha', detail: formatDateTime(order.accepted.at) },
              { key: 'actor', term: 'Registrado por', detail: order.accepted.actor },
            ]}
          />
        ) : order.status === 'quoted' && order.quote ? (
          <>
            <p>Cotización versión {order.quote.version} pendiente de aceptación.</p>
            <Button onClick={() => setOpen(true)}>Aceptar cotización</Button>
          </>
        ) : null}
      </CardBody>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Aceptar cotización"
        description="Esta aceptación es un registro administrativo interno. No reemplaza el consentimiento propio del cliente, obtenido por un canal externo (por ejemplo, su confirmación escrita)."
        confirmLabel="Aceptar"
        onConfirm={() => {
          if (!order.quote) return;
          mutation.mutate(order.quote.version);
        }}
      />
    </Card>
  );
}
