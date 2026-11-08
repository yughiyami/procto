import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Field, Input, MoneyInput, useToast } from '@izumi/ui';
import { formatPen, parsePenToCents, quoteSchema, toIsoWithOffset } from '@izumi/contracts';
import type { Feasibility, Order } from '@izumi/contracts';
import { ApiError } from '@izumi/api-client';
import { apiClient } from '../../../lib/apiClient';
import { useIdempotentMutation } from '../../../hooks/useIdempotentMutation';

interface Props {
  order: Order;
  feasibility: Feasibility;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * The two cross-order rules (`validUntil <= order.dueAt` and `<=` every contribution's
 * `validUntil`) live in the handler, not in `quoteSchema` — see docs/frontend-contract.md.
 * We pre-check them here for fast feedback but still render the server's 409 verbatim
 * if it rejects anyway (a contribution could change between check and submit).
 */
export function QuoteForm({ order, feasibility, onSuccess, onCancel }: Props) {
  const toast = useToast();
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [logisticsCents, setLogisticsCents] = useState<number | null>(0);
  const [coordinationCents, setCoordinationCents] = useState<number | null>(0);
  const [validUntil, setValidUntil] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [domainError, setDomainError] = useState<string | null>(null);
  const [crossOrderWarning, setCrossOrderWarning] = useState<string | null>(null);

  const totalCost = feasibility.costCents + (logisticsCents ?? 0) + (coordinationCents ?? 0);
  const contribution = (priceCents ?? 0) - totalCost;

  const mutation = useIdempotentMutation(
    (input: Parameters<typeof apiClient.createQuote>[1], key: string) => apiClient.createQuote(order.id, input, key),
    {
      onSuccess: () => {
        toast.show({ message: 'Cotización creada.', tone: 'success' });
        onSuccess();
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
    setCrossOrderWarning(null);

    const candidate = {
      priceCents: priceCents ?? 0,
      logisticsCents: logisticsCents ?? 0,
      coordinationCents: coordinationCents ?? 0,
      validUntil: toIsoWithOffset(validUntil) ?? '',
    };

    const result = quoteSchema.safeParse(candidate);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join('.');
        if (key) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    const validUntilTime = Date.parse(result.data.validUntil);
    if (validUntilTime > Date.parse(order.dueAt)) {
      setCrossOrderWarning('La cotización debe vencer antes o el mismo día que la fecha límite del pedido.');
      return;
    }
    const outlivesContribution = order.contributions.some((c) => Date.parse(c.validUntil) < validUntilTime);
    if (outlivesContribution) {
      setCrossOrderWarning(
        'La cotización no puede vencer después que el compromiso de algún proveedor. Ajusta la fecha o renueva ese aporte.',
      );
      return;
    }

    mutation.mutate(result.data);
  }

  return (
    <form onSubmit={handleSubmit} className="order-detail__form" noValidate>
      {domainError ? (
        <Alert tone="warning" title="No se pudo crear la cotización">
          {domainError}
        </Alert>
      ) : null}
      {crossOrderWarning ? (
        <Alert tone="warning" title="Revisa la fecha de vencimiento">
          {crossOrderWarning}
        </Alert>
      ) : null}

      <Field label="Precio" htmlFor="quote-price" required error={fieldErrors.priceCents}>
        <MoneyInput
          id="quote-price"
          valueCents={priceCents}
          onChangeCents={setPriceCents}
          format={formatPen}
          parse={parsePenToCents}
          error={Boolean(fieldErrors.priceCents)}
          required
        />
      </Field>
      <Field label="Logística" htmlFor="quote-logistics" error={fieldErrors.logisticsCents}>
        <MoneyInput
          id="quote-logistics"
          valueCents={logisticsCents}
          onChangeCents={setLogisticsCents}
          format={formatPen}
          parse={parsePenToCents}
          error={Boolean(fieldErrors.logisticsCents)}
        />
      </Field>
      <Field label="Coordinación" htmlFor="quote-coordination" error={fieldErrors.coordinationCents}>
        <MoneyInput
          id="quote-coordination"
          valueCents={coordinationCents}
          onChangeCents={setCoordinationCents}
          format={formatPen}
          parse={parsePenToCents}
          error={Boolean(fieldErrors.coordinationCents)}
        />
      </Field>
      <Field label="Válida hasta" htmlFor="quote-valid-until" required error={fieldErrors.validUntil}>
        <Input
          id="quote-valid-until"
          type="datetime-local"
          value={validUntil}
          onChange={(event) => setValidUntil(event.target.value)}
          error={Boolean(fieldErrors.validUntil)}
          required
        />
      </Field>

      <div className="order-detail__quote-preview">
        <p>Costo total estimado: {formatPen(totalCost)}</p>
        <p className={contribution < 0 ? 'order-detail__quote-preview-negative' : undefined}>
          Contribución estimada: {formatPen(contribution)}
        </p>
      </div>

      <div className="order-detail__form-actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Guardar cotización
        </Button>
      </div>
    </form>
  );
}
