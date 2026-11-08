import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@izumi/api-client';
import type { PublicContributionInput } from '@izumi/api-client';
import { publicContributionSchema, formatDateTime, formatPen, toIsoWithOffset } from '@izumi/contracts';
import type { PublicInvitation } from '@izumi/contracts';
import { Alert, Button, DescriptionList, Field, MoneyInput, Textarea } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';

interface SupplierResponseFormProps {
  token: string;
  invitation: PublicInvitation;
}

/** Draft shape mirrors publicContributionSchema, but numeric/date fields stay
 * as raw strings/nulls while the person is typing so the form never forces a
 * value before it is complete. */
interface Draft {
  quantity: string;
  unitCostCents: number | null;
  availableAt: string;
  validUntil: string;
  specification: string;
  confirmed: boolean;
}

function buildInitialDraft(invitation: PublicInvitation): Draft {
  return {
    quantity: '',
    unitCostCents: null,
    availableAt: '',
    validUntil: '',
    specification: invitation.specification,
    confirmed: false,
  };
}

/** Supplier-facing side of the public invitation: a commitment to supply part of an order. */
export function SupplierResponseForm({ token, invitation }: SupplierResponseFormProps) {
  const [draft, setDraft] = useState<Draft>(() => buildInitialDraft(invitation));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [domainError, setDomainError] = useState<string | null>(null);
  const [submittedSnapshot, setSubmittedSnapshot] = useState<PublicContributionInput | null>(null);

  const mutation = useMutation({
    mutationFn: (input: PublicContributionInput) => apiClient.submitPublicInvitation(token, input),
    onSuccess: (_result, variables) => {
      setSubmittedSnapshot(variables);
      setDomainError(null);
      setFieldErrors({});
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.kind === 'invalid_input') {
        setFieldErrors(err.fieldErrors());
        setDomainError(null);
      } else if (err instanceof ApiError) {
        setDomainError(err.userMessage());
      } else {
        setDomainError('No se pudo enviar tu respuesta. Inténtalo de nuevo.');
      }
    },
  });

  const quantityNumber = Number.parseInt(draft.quantity, 10);
  const lineTotalCents =
    Number.isFinite(quantityNumber) && quantityNumber > 0 && draft.unitCostCents !== null
      ? quantityNumber * draft.unitCostCents
      : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    setDomainError(null);

    const availableAtIso = toIsoWithOffset(draft.availableAt);
    const validUntilIso = toIsoWithOffset(draft.validUntil);
    const candidate = {
      specification: draft.specification,
      quantity: Number.isFinite(quantityNumber) ? quantityNumber : draft.quantity,
      unitCostCents: draft.unitCostCents,
      availableAt: availableAtIso,
      validUntil: validUntilIso,
      confirmed: draft.confirmed,
    };

    const result = publicContributionSchema.safeParse(candidate);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join('.');
        if (key) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    mutation.mutate(result.data);
  }

  if (submittedSnapshot) {
    return (
      <div className="invitation__confirmation">
        <Alert tone="success" title="Respuesta enviada">
          El coordinador recibió tu propuesta y se pondrá en contacto contigo. Esto todavía no es
          una compra confirmada.
        </Alert>
        <DescriptionList
          items={[
            { key: 'quantity', term: 'Cantidad ofrecida', detail: submittedSnapshot.quantity },
            {
              key: 'unitCost',
              term: 'Costo unitario',
              detail: formatPen(submittedSnapshot.unitCostCents),
            },
            {
              key: 'total',
              term: 'Total de la línea',
              detail: formatPen(submittedSnapshot.quantity * submittedSnapshot.unitCostCents),
            },
            {
              key: 'availableAt',
              term: 'Disponible desde',
              detail: formatDateTime(submittedSnapshot.availableAt),
            },
            {
              key: 'validUntil',
              term: 'Compromiso válido hasta',
              detail: formatDateTime(submittedSnapshot.validUntil),
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="invitation__supplier">
      <h1 className="invitation__title">Solicitud de suministro</h1>

      <DescriptionList
        className="invitation__summary"
        items={[
          { key: 'title', term: 'Pedido', detail: invitation.title },
          { key: 'specification', term: 'Especificación solicitada', detail: invitation.specification },
          { key: 'quantity', term: 'Cantidad requerida', detail: invitation.quantity },
          { key: 'dueAt', term: 'Fecha límite', detail: formatDateTime(invitation.dueAt) },
        ]}
      />

      {domainError ? (
        <Alert tone="warning" title="No se pudo registrar tu respuesta">
          {domainError}
        </Alert>
      ) : null}

      <form className="invitation__form" onSubmit={handleSubmit} noValidate>
        <Field label="Cantidad que puedes ofrecer" htmlFor="quantity" required error={fieldErrors.quantity}>
          <input
            id="quantity"
            className="izu-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            step={1}
            value={draft.quantity}
            onChange={(event) => setDraft((prev) => ({ ...prev, quantity: event.target.value }))}
            required
          />
        </Field>

        <Field label="Costo unitario" htmlFor="unitCost" required error={fieldErrors.unitCostCents}>
          <MoneyInput
            id="unitCost"
            valueCents={draft.unitCostCents}
            onChangeCents={(cents) => setDraft((prev) => ({ ...prev, unitCostCents: cents }))}
            format={formatPen}
            required
          />
        </Field>

        {lineTotalCents !== null ? (
          <p className="invitation__line-total">
            Total de esta línea: <strong>{formatPen(lineTotalCents)}</strong>
          </p>
        ) : null}

        <Field
          label="Disponible desde"
          htmlFor="availableAt"
          required
          error={fieldErrors.availableAt}
        >
          <input
            id="availableAt"
            className="izu-input"
            type="datetime-local"
            value={draft.availableAt}
            onChange={(event) => setDraft((prev) => ({ ...prev, availableAt: event.target.value }))}
            required
          />
        </Field>

        <Field
          label="Tu compromiso es válido hasta"
          htmlFor="validUntil"
          required
          hint="Después de esta fecha el coordinador ya no puede contar con tu oferta."
          error={fieldErrors.validUntil}
        >
          <input
            id="validUntil"
            className="izu-input"
            type="datetime-local"
            value={draft.validUntil}
            onChange={(event) => setDraft((prev) => ({ ...prev, validUntil: event.target.value }))}
            required
          />
        </Field>

        <Field
          label="Especificación"
          htmlFor="specification"
          required
          hint="Debe coincidir exactamente con lo solicitado. Si el texto no calza, el coordinador no podrá incluir tu propuesta."
          error={fieldErrors.specification}
        >
          <Textarea
            id="specification"
            rows={4}
            value={draft.specification}
            onChange={(event) => setDraft((prev) => ({ ...prev, specification: event.target.value }))}
            required
          />
        </Field>

        <label className="invitation__checkbox">
          <input
            type="checkbox"
            checked={draft.confirmed}
            onChange={(event) => setDraft((prev) => ({ ...prev, confirmed: event.target.checked }))}
            required
          />
          <span>Confirmo que puedo cumplir con estas condiciones.</span>
        </label>
        <p className="invitation__hint">
          Esto es un compromiso declarado, no una reserva de stock verificada por el sistema.
        </p>
        {fieldErrors.confirmed ? <p className="invitation__field-error">{fieldErrors.confirmed}</p> : null}

        <Button type="submit" fullWidth loading={mutation.isPending}>
          Enviar respuesta
        </Button>
      </form>
    </div>
  );
}
