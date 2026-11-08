import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, MoneyInput, Select, Table, Textarea, useToast } from '@izumi/ui';
import type { TableColumn } from '@izumi/ui';
import { canPerform, formatPen, movementSchema, parsePenToCents, whyBlocked } from '@izumi/contracts';
import type { MovementKind, Order } from '@izumi/contracts';
import { ApiError } from '@izumi/api-client';
import { apiClient } from '../../../lib/apiClient';
import { useIdempotentMutation } from '../../../hooks/useIdempotentMutation';

interface Props {
  order: Order;
  onChanged: () => void;
}

type MovementRow = Order['movements'][number];
type Verification = 'declared' | 'manually_verified';

const KIND_LABELS: Record<MovementKind, string> = {
  customer_receipt: 'Cobro del cliente',
  supplier_payment: 'Pago a proveedor',
  other_cost: 'Otro costo',
  customer_refund: 'Devolución al cliente',
};

const VERIFICATION_LABELS: Record<Verification, string> = {
  declared: 'Declarado',
  manually_verified: 'Verificado manualmente',
};

/** Operational money log — never a bank reconciliation, and the honesty line says so. */
export function MovementsSection({ order, onChanged }: Props) {
  const toast = useToast();
  const [kind, setKind] = useState<MovementKind>('customer_receipt');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [verification, setVerification] = useState<Verification>('declared');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [domainError, setDomainError] = useState<string | null>(null);

  const allowed = canPerform(order.status, 'movement');
  const blockedReason = whyBlocked(order.status, 'movement');

  const mutation = useIdempotentMutation(
    (input: Parameters<typeof apiClient.addMovement>[1], key: string) => apiClient.addMovement(order.id, input, key),
    {
      onSuccess: () => {
        toast.show({ message: 'Movimiento registrado.', tone: 'success' });
        setAmountCents(null);
        setReference('');
        setCounterparty('');
        setNote('');
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

    const candidate = { kind, amountCents: amountCents ?? 0, reference, counterparty, verification, note };
    const result = movementSchema.safeParse(candidate);
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

  const columns: TableColumn<MovementRow>[] = [
    { key: 'kind', header: 'Tipo', render: (row) => KIND_LABELS[row.kind] },
    { key: 'amount', header: 'Monto', render: (row) => formatPen(row.amountCents), align: 'right' },
    { key: 'reference', header: 'Referencia', render: (row) => row.reference },
    { key: 'counterparty', header: 'Contraparte', render: (row) => row.counterparty },
    {
      key: 'verification',
      header: 'Verificación',
      render: (row) => (
        <Badge tone={row.verification === 'manually_verified' ? 'success' : 'neutral'}>
          {VERIFICATION_LABELS[row.verification]}
        </Badge>
      ),
    },
    { key: 'note', header: 'Nota', render: (row) => row.note },
  ];

  return (
    <Card className="order-detail__movements">
      <CardHeader title="Movimientos de dinero" />
      <CardBody>
        <p className="order-detail__hint">Este es un registro operativo interno, no una conciliación bancaria.</p>

        <Table
          columns={columns}
          rows={order.movements}
          keyExtractor={(row) => row.id}
          emptyContent={<p>Todavía no hay movimientos registrados.</p>}
        />

        {!allowed && blockedReason ? <p className="order-detail__hint">{blockedReason}</p> : null}

        {allowed ? (
          <form onSubmit={handleSubmit} className="order-detail__form" noValidate>
            {domainError ? (
              <Alert tone="warning" title="No se pudo registrar el movimiento">
                {domainError}
              </Alert>
            ) : null}

            <Field label="Tipo" htmlFor="movement-kind" required>
              <Select
                id="movement-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as MovementKind)}
                required
              >
                {(Object.keys(KIND_LABELS) as MovementKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Monto" htmlFor="movement-amount" required error={fieldErrors.amountCents}>
              <MoneyInput
                id="movement-amount"
                valueCents={amountCents}
                onChangeCents={setAmountCents}
                format={formatPen}
                parse={parsePenToCents}
                error={Boolean(fieldErrors.amountCents)}
                required
              />
            </Field>

            <Field
              label="Referencia"
              htmlFor="movement-reference"
              required
              hint="Debe ser única dentro del pedido; una referencia repetida es la causa más probable de un rechazo."
              error={fieldErrors.reference}
            >
              <Input
                id="movement-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                error={Boolean(fieldErrors.reference)}
                required
              />
            </Field>

            <Field label="Contraparte" htmlFor="movement-counterparty" error={fieldErrors.counterparty}>
              <Input
                id="movement-counterparty"
                value={counterparty}
                onChange={(event) => setCounterparty(event.target.value)}
                error={Boolean(fieldErrors.counterparty)}
              />
            </Field>

            <Field label="Verificación" htmlFor="movement-verification" required>
              <Select
                id="movement-verification"
                value={verification}
                onChange={(event) => setVerification(event.target.value as Verification)}
                required
              >
                {(Object.keys(VERIFICATION_LABELS) as Verification[]).map((v) => (
                  <option key={v} value={v}>
                    {VERIFICATION_LABELS[v]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Nota" htmlFor="movement-note" error={fieldErrors.note}>
              <Textarea
                id="movement-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                error={Boolean(fieldErrors.note)}
                rows={2}
              />
            </Field>

            <div className="order-detail__form-actions">
              <Button type="submit" loading={mutation.isPending}>
                Registrar movimiento
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
