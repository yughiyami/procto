import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Field, Input, MoneyInput, Select, Textarea, fieldDescribedBy, useToast } from '@izumi/ui';
import { contributionSchema, formatPen, parsePenToCents, toIsoWithOffset } from '@izumi/contracts';
import type { Order } from '@izumi/contracts';
import { ApiError } from '@izumi/api-client';
import { apiClient } from '../../../lib/apiClient';
import { useIdempotentMutation } from '../../../hooks/useIdempotentMutation';
import { useSuppliers } from './useSupplierOptions';

interface Props {
  order: Order;
  onSuccess: () => void;
  onCancel: () => void;
}

/** Modal form for POST /orders/:id/contributions. Prefills specification with the order's own. */
export function ContributionForm({ order, onSuccess, onCancel }: Props) {
  const suppliersQuery = useSuppliers();
  const toast = useToast();

  const [supplierId, setSupplierId] = useState('');
  const [specification, setSpecification] = useState(order.specification);
  const [quantity, setQuantity] = useState('');
  const [unitCostCents, setUnitCostCents] = useState<number | null>(null);
  const [availableAt, setAvailableAt] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [domainError, setDomainError] = useState<string | null>(null);

  // domain.addContribution upserts by supplierId: a second aporte from the same
  // supplier silently replaces the first. Warn before the coordinator loses data.
  const existingForSupplier = supplierId
    ? order.contributions.find((c) => c.supplierId === supplierId)
    : undefined;

  const mutation = useIdempotentMutation(
    (input: Parameters<typeof apiClient.addContribution>[1], key: string) =>
      apiClient.addContribution(order.id, input, key),
    {
      onSuccess: () => {
        toast.show({ message: 'Aporte registrado.', tone: 'success' });
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

    const candidate = {
      supplierId,
      specification,
      quantity: Number(quantity),
      unitCostCents: unitCostCents ?? 0,
      availableAt: toIsoWithOffset(availableAt) ?? '',
      validUntil: toIsoWithOffset(validUntil) ?? '',
      confirmed,
    };

    const result = contributionSchema.safeParse(candidate);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join('.');
        if (key) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    mutation.mutate(result.data);
  }

  return (
    <form onSubmit={handleSubmit} className="order-detail__form" noValidate>
      {order.status === 'quoted' ? (
        <Alert tone="warning" title="Esto invalida la cotización actual">
          Agregar un aporte ahora hará que el pedido vuelva a estado borrador. Deberás volver a cotizar.
        </Alert>
      ) : null}

      {existingForSupplier ? (
        <Alert tone="warning" title="Este proveedor ya tiene un aporte registrado">
          Al guardar reemplazarás su aporte actual de {existingForSupplier.quantity} unidades a{' '}
          {formatPen(existingForSupplier.unitCostCents)} por unidad. No se agrega una línea nueva:
          cada proveedor mantiene un solo compromiso vigente por pedido.
        </Alert>
      ) : null}

      {domainError ? (
        <Alert tone="warning" title="No se pudo registrar el aporte">
          {domainError}
        </Alert>
      ) : null}

      <Field label="Proveedor" htmlFor="contribution-supplier" required error={fieldErrors.supplierId}>
        <Select
          id="contribution-supplier"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
          error={Boolean(fieldErrors.supplierId)}
          aria-describedby={fieldDescribedBy('contribution-supplier', { error: Boolean(fieldErrors.supplierId) })}
          required
        >
          <option value="">Selecciona un proveedor</option>
          {(suppliersQuery.data ?? []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Especificación"
        htmlFor="contribution-specification"
        required
        hint="Debe coincidir exactamente con la especificación del pedido: eso es lo que hace viable este aporte."
        error={fieldErrors.specification}
      >
        <Textarea
          id="contribution-specification"
          value={specification}
          onChange={(event) => setSpecification(event.target.value)}
          error={Boolean(fieldErrors.specification)}
          rows={3}
          required
        />
      </Field>

      <Field label="Cantidad" htmlFor="contribution-quantity" required error={fieldErrors.quantity}>
        <Input
          id="contribution-quantity"
          type="number"
          min={1}
          max={100000}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          error={Boolean(fieldErrors.quantity)}
          required
        />
      </Field>

      <Field label="Costo unitario" htmlFor="contribution-unit-cost" required error={fieldErrors.unitCostCents}>
        <MoneyInput
          id="contribution-unit-cost"
          valueCents={unitCostCents}
          onChangeCents={setUnitCostCents}
          format={formatPen}
          parse={parsePenToCents}
          error={Boolean(fieldErrors.unitCostCents)}
          required
        />
      </Field>

      <Field label="Disponible desde" htmlFor="contribution-available-at" required error={fieldErrors.availableAt}>
        <Input
          id="contribution-available-at"
          type="datetime-local"
          value={availableAt}
          onChange={(event) => setAvailableAt(event.target.value)}
          error={Boolean(fieldErrors.availableAt)}
          required
        />
      </Field>

      <Field label="Válido hasta" htmlFor="contribution-valid-until" required error={fieldErrors.validUntil}>
        <Input
          id="contribution-valid-until"
          type="datetime-local"
          value={validUntil}
          onChange={(event) => setValidUntil(event.target.value)}
          error={Boolean(fieldErrors.validUntil)}
          required
        />
      </Field>

      <Field
        label="Compromiso confirmado por el proveedor"
        htmlFor="contribution-confirmed"
        hint="Confirmado significa que el proveedor declaró este compromiso, no que el stock esté reservado."
      >
        <input
          id="contribution-confirmed"
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
      </Field>

      <div className="order-detail__form-actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Guardar aporte
        </Button>
      </div>
    </form>
  );
}
