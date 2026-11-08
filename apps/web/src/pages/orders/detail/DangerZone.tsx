import { useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, ConfirmDialog, useToast } from '@izumi/ui';
import { canPerform, whyBlocked } from '@izumi/contracts';
import type { Order } from '@izumi/contracts';
import { ApiError } from '@izumi/api-client';
import { apiClient } from '../../../lib/apiClient';
import { useIdempotentMutation } from '../../../hooks/useIdempotentMutation';

interface Props {
  order: Order;
  onChanged: () => void;
}

/** Cancels the order. Quotes the domain's own caveat: no money moves automatically. */
export function DangerZone({ order, onChanged }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  const mutation = useIdempotentMutation((_: void, key: string) => apiClient.cancelOrder(order.id, key), {
    onSuccess: () => {
      toast.show({ message: 'Pedido cancelado.', tone: 'success' });
      setOpen(false);
      onChanged();
    },
    onError: (error) => {
      setDomainError(error instanceof ApiError ? error.userMessage() : 'No pudimos completar la solicitud.');
    },
  });

  const allowed = canPerform(order.status, 'cancel');
  const blockedReason = whyBlocked(order.status, 'cancel');

  return (
    <Card className="order-detail__danger">
      <CardHeader title="Zona de riesgo" />
      <CardBody>
        {domainError ? (
          <Alert tone="warning" title="No se pudo cancelar el pedido">
            {domainError}
          </Alert>
        ) : null}
        <p>
          Cancelar el pedido detiene el flujo operativo. Liberar a los proveedores y emitir reembolsos requiere
          seguimiento humano — ninguna acción de dinero ocurre automáticamente.
        </p>
        {!allowed && blockedReason ? <p className="order-detail__hint">{blockedReason}</p> : null}
        <Button variant="danger" onClick={() => setOpen(true)} disabled={!allowed}>
          Cancelar pedido
        </Button>
      </CardBody>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancelar pedido"
        description="Esta acción cancela el pedido. Recuerda: liberar proveedores y emitir reembolsos requiere seguimiento humano; el sistema no mueve dinero automáticamente."
        confirmLabel="Cancelar pedido"
        tone="danger"
        onConfirm={() => mutation.mutate()}
      />
    </Card>
  );
}
