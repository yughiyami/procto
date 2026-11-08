import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@izumi/api-client';
import { formatDateTime, formatPen, isFuture } from '@izumi/contracts';
import type { PublicInvitation } from '@izumi/contracts';
import { Alert, Button, ConfirmDialog, DescriptionList } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';

interface CustomerAcceptanceProps {
  token: string;
  invitation: PublicInvitation;
}

/** Customer-facing side of the public invitation: accepting a specific quote version. */
export function CustomerAcceptance({ token, invitation }: CustomerAcceptanceProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const quote = invitation.quote;

  const mutation = useMutation({
    mutationFn: (version: number) => apiClient.submitPublicInvitation(token, { accept: true, version }),
    onSuccess: () => {
      setAccepted(true);
      setDomainError(null);
      setConfirmOpen(false);
    },
    onError: (err: unknown) => {
      setConfirmOpen(false);
      if (err instanceof ApiError) {
        setDomainError(err.userMessage());
      } else {
        setDomainError('No se pudo registrar tu aceptación. Inténtalo de nuevo.');
      }
    },
  });

  const orderSummary = (
    <DescriptionList
      className="invitation__summary"
      items={[
        { key: 'title', term: 'Pedido', detail: invitation.title },
        { key: 'specification', term: 'Especificación', detail: invitation.specification },
        { key: 'quantity', term: 'Cantidad', detail: invitation.quantity },
        { key: 'dueAt', term: 'Fecha límite', detail: formatDateTime(invitation.dueAt) },
      ]}
    />
  );

  if (accepted) {
    return (
      <div className="invitation__confirmation">
        <Alert tone="success" title="Aceptación registrada">
          Registramos tu aceptación de esta cotización. El coordinador dará seguimiento a los
          siguientes pasos.
        </Alert>
        {orderSummary}
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="invitation__customer">
        <h1 className="invitation__title">Pedido</h1>
        {orderSummary}
        <Alert tone="info" title="Todavía no hay una oferta para aceptar">
          El coordinador aún no generó una cotización para este pedido. Cuando la tenga lista, te
          enviará un nuevo enlace o esta misma invitación se actualizará.
        </Alert>
      </div>
    );
  }

  const quoteExpired = !isFuture(quote.validUntil);

  return (
    <div className="invitation__customer">
      <h1 className="invitation__title">Cotización del pedido</h1>
      {orderSummary}

      <DescriptionList
        className="invitation__summary"
        items={[
          { key: 'price', term: 'Precio total', detail: formatPen(quote.priceCents) },
          { key: 'currency', term: 'Moneda', detail: quote.currency },
          { key: 'validUntil', term: 'Oferta válida hasta', detail: formatDateTime(quote.validUntil) },
        ]}
      />

      {domainError ? (
        <Alert tone="warning" title="No se pudo registrar tu aceptación">
          {domainError}
        </Alert>
      ) : null}

      {quoteExpired ? (
        <Alert tone="warning" title="Esta oferta venció">
          La fecha de validez de la cotización ya pasó. Pide al coordinador que la reconfirme
          antes de poder aceptarla.
        </Alert>
      ) : (
        <>
          <p className="invitation__hint">
            Al aceptar, registras la aceptación de esta versión exacta de la oferta. Si el precio,
            la cantidad o la fecha cambian más adelante, se necesitará una nueva aceptación.
          </p>
          <Button type="button" fullWidth onClick={() => setConfirmOpen(true)}>
            Aceptar cotización
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar aceptación"
        description={
          <p>
            Vas a aceptar la cotización por <strong>{formatPen(quote.priceCents)}</strong>, válida
            hasta <strong>{formatDateTime(quote.validUntil)}</strong>. Esta acción registra un
            compromiso comercial.
          </p>
        }
        confirmLabel="Sí, aceptar"
        cancelLabel="Cancelar"
        onConfirm={async () => {
          try {
            await mutation.mutateAsync(quote.version);
          } catch {
            // Surfaced via mutation.onError above; swallow here so the dialog
            // does not also throw an unhandled rejection.
          }
        }}
      />
    </div>
  );
}
