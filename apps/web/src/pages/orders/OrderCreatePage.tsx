import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys } from '@izumi/api-client';
import type { CreateOrderInput } from '@izumi/api-client';
import type { Order } from '@izumi/contracts';
import { createOrderSchema, parsePenToCents, toIsoWithOffset } from '@izumi/contracts';
import { Alert, Button, Field, Input, MoneyInput, PageHeader, Textarea, useToast } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { useIdempotentMutation } from '../../hooks/useIdempotentMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './OrderCreatePage.css';

type FormState = {
  title: string;
  specification: string;
  quantity: string;
  dueAt: string;
  ownQuantity: string;
  ownCostCents: number | null;
};

const INITIAL_STATE: FormState = {
  title: '',
  specification: '',
  quantity: '',
  dueAt: '',
  ownQuantity: '0',
  ownCostCents: 0,
};

/**
 * Spanish, field-scoped messages for the rules `createOrderSchema` encodes.
 * `safeParse` decides *whether* a field is valid; this dictionary decides
 * *what we say about it* — the schema's own zod issue messages are English
 * and are reserved for the server's 400 payload (rendered verbatim there).
 */
const FIELD_MESSAGES: Partial<Record<keyof CreateOrderInput, string>> = {
  title: 'Ingresa un título de hasta 200 caracteres.',
  specification: 'Ingresa una especificación de hasta 4000 caracteres.',
  quantity: 'La cantidad debe ser un número entero entre 1 y 100 000.',
  dueAt: 'Elige una fecha y hora de entrega futura y válida.',
  ownQuantity: 'No puedes aportar más unidades de las que pide el pedido.',
  ownCostCents: 'Ingresa un costo entre S/ 0 y S/ 10 000 000.',
};

function buildPayload(form: FormState): CreateOrderInput {
  return {
    title: form.title.trim(),
    specification: form.specification.trim(),
    quantity: Number(form.quantity),
    dueAt: toIsoWithOffset(form.dueAt) ?? '',
    ownQuantity: Number(form.ownQuantity),
    ownCostCents: form.ownCostCents ?? 0,
    currency: 'PEN',
  };
}

function validate(form: FormState): Record<string, string> {
  const result = createOrderSchema.safeParse(buildPayload(form));
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_root';
    if (!(key in errors)) {
      errors[key] = FIELD_MESSAGES[key as keyof CreateOrderInput] ?? 'Revisa este campo.';
    }
  }
  return errors;
}

export default function OrderCreatePage() {
  useDocumentTitle('Nuevo pedido');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [domainAlert, setDomainAlert] = useState<string | null>(null);

  const mutation = useIdempotentMutation<Order, CreateOrderInput>(
    (vars, key) => apiClient.createOrder(vars, key),
    {
      onSuccess: (created) => {
        toast.show({ message: `Pedido "${created.title}" creado correctamente.`, tone: 'success' });
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
        navigate(`/orders/${created.id}`);
      },
      onError: (err: unknown) => {
        if (err instanceof ApiError && err.kind !== 'invalid_input') {
          setDomainAlert(err.userMessage());
        }
      },
    },
  );

  const clientErrors = validate(form);
  const serverFieldErrors =
    mutation.error instanceof ApiError && mutation.error.kind === 'invalid_input' ? mutation.error.fieldErrors() : {};

  function fieldError(name: string): string | undefined {
    return serverFieldErrors[name] ?? (touched[name] ? clientErrors[name] : undefined);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDomainAlert(null);
    if (mutation.isError) {
      mutation.resetIntent();
      mutation.reset();
    }
  }

  function markTouched(name: string) {
    setTouched((prev) => ({ ...prev, [name]: true }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({
      title: true,
      specification: true,
      quantity: true,
      dueAt: true,
      ownQuantity: true,
      ownCostCents: true,
    });
    if (Object.keys(clientErrors).length > 0) return;
    mutation.mutate(buildPayload(form));
  }

  const quantityValue = Number(form.quantity) || 0;
  const ownValue = Number(form.ownQuantity) || 0;
  const missing = Math.max(quantityValue - ownValue, 0);

  return (
    <div className="order-create">
      <PageHeader
        title="Nuevo pedido"
        subtitle="Registra los datos del pedido antes de coordinar con proveedores."
      />

      {domainAlert ? (
        <Alert tone="warning" title="No se pudo crear el pedido">
          {domainAlert}
        </Alert>
      ) : null}

      <form className="order-create__form" onSubmit={handleSubmit} noValidate>
        <Field label="Título" htmlFor="title" required error={fieldError('title')}>
          <Input
            id="title"
            value={form.title}
            maxLength={200}
            onChange={(event) => updateField('title', event.target.value)}
            onBlur={() => markTouched('title')}
            error={Boolean(fieldError('title'))}
          />
        </Field>

        <Field
          label="Especificación"
          htmlFor="specification"
          required
          hint="Debe coincidir exactamente con la especificación que declaren tus proveedores: si no coincide letra por letra, el pedido no será viable."
          error={fieldError('specification')}
        >
          <Textarea
            id="specification"
            rows={4}
            maxLength={4000}
            value={form.specification}
            onChange={(event) => updateField('specification', event.target.value)}
            onBlur={() => markTouched('specification')}
            error={Boolean(fieldError('specification'))}
          />
        </Field>

        <Field label="Cantidad" htmlFor="quantity" required error={fieldError('quantity')}>
          <Input
            id="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={form.quantity}
            onChange={(event) => updateField('quantity', event.target.value)}
            onBlur={() => markTouched('quantity')}
            error={Boolean(fieldError('quantity'))}
          />
        </Field>

        <Field label="Fecha límite de entrega" htmlFor="dueAt" required error={fieldError('dueAt')}>
          <Input
            id="dueAt"
            type="datetime-local"
            value={form.dueAt}
            onChange={(event) => updateField('dueAt', event.target.value)}
            onBlur={() => markTouched('dueAt')}
            error={Boolean(fieldError('dueAt'))}
          />
        </Field>

        <Field
          label="Unidades que cubre tu taller"
          htmlFor="ownQuantity"
          hint="No puedes aportar más unidades de las que pide el pedido."
          error={fieldError('ownQuantity')}
        >
          <Input
            id="ownQuantity"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.ownQuantity}
            onChange={(event) => updateField('ownQuantity', event.target.value)}
            onBlur={() => markTouched('ownQuantity')}
            error={Boolean(fieldError('ownQuantity'))}
          />
        </Field>

        <Field label="Costo de tu aporte" htmlFor="ownCostCents" error={fieldError('ownCostCents')}>
          <MoneyInput
            id="ownCostCents"
            valueCents={form.ownCostCents}
            onChangeCents={(cents) => {
              updateField('ownCostCents', cents);
              markTouched('ownCostCents');
            }}
            parse={parsePenToCents}
            error={Boolean(fieldError('ownCostCents'))}
          />
        </Field>

        <Field label="Moneda" htmlFor="currency" hint="Todos los pedidos se manejan en soles peruanos.">
          <Input id="currency" value="PEN — Soles" disabled readOnly />
        </Field>

        <p className="order-create__coverage" aria-live="polite">
          Tu taller cubre <strong>{ownValue}</strong> de <strong>{quantityValue}</strong> unidades; faltan{' '}
          <strong>{missing}</strong> por conseguir.
        </p>

        <Button type="submit" loading={mutation.isPending} fullWidth>
          Crear pedido
        </Button>
      </form>
    </div>
  );
}
