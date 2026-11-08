import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Modal, Select, useToast } from '@izumi/ui';
import { canPerform, daysFromNow, fromIsoToLocalInput, invitationSchema, toIsoWithOffset, whyBlocked } from '@izumi/contracts';
import type { Order } from '@izumi/contracts';
import { ApiError } from '@izumi/api-client';
import { apiClient } from '../../../lib/apiClient';
import { useIdempotentMutation } from '../../../hooks/useIdempotentMutation';
import { useSuppliers } from './useSupplierOptions';

interface Props {
  order: Order;
  onChanged: () => void;
}

type Purpose = 'supplier' | 'customer';

/** Creates an invitation. The API returns the token exactly once — we never persist it. */
export function InvitationsPanel({ order, onChanged }: Props) {
  const toast = useToast();
  const suppliersQuery = useSuppliers();

  const [purpose, setPurpose] = useState<Purpose>('supplier');
  const [supplierId, setSupplierId] = useState('');
  const [expiresAt, setExpiresAt] = useState(() => fromIsoToLocalInput(daysFromNow(7)));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [domainError, setDomainError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const supplierAllowed = canPerform(order.status, 'invite_supplier');
  const customerAllowed = canPerform(order.status, 'invite_customer');
  const allowed = purpose === 'supplier' ? supplierAllowed : customerAllowed;
  const blockedReason =
    purpose === 'supplier' ? whyBlocked(order.status, 'invite_supplier') : whyBlocked(order.status, 'invite_customer');

  const maxExpiresAt = fromIsoToLocalInput(daysFromNow(7));

  const mutation = useIdempotentMutation(
    (input: Parameters<typeof apiClient.createInvitation>[1], key: string) =>
      apiClient.createInvitation(order.id, input, key),
    {
      onSuccess: (result) => {
        setLink(`${window.location.origin}/i/${result.token}`);
        toast.show({ message: 'Invitación creada.', tone: 'success' });
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

    const candidate = {
      purpose,
      supplierId: purpose === 'supplier' ? supplierId : undefined,
      expiresAt: toIsoWithOffset(expiresAt) ?? '',
    };
    const result = invitationSchema.safeParse(candidate);
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

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="order-detail__invitations">
      <CardHeader title="Invitaciones" />
      <CardBody>
        <form onSubmit={handleSubmit} className="order-detail__form" noValidate>
          {domainError ? (
            <Alert tone="warning" title="No se pudo crear la invitación">
              {domainError}
            </Alert>
          ) : null}

          <Field label="Tipo de invitación" htmlFor="invitation-purpose" required>
            <Select id="invitation-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose)} required>
              <option value="supplier">Proveedor</option>
              <option value="customer">Cliente</option>
            </Select>
          </Field>

          {purpose === 'supplier' ? (
            <Field label="Proveedor" htmlFor="invitation-supplier" required error={fieldErrors.supplierId}>
              <Select
                id="invitation-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                error={Boolean(fieldErrors.supplierId)}
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
          ) : (
            <p className="order-detail__hint">
              La invitación al cliente solo está disponible cuando el pedido tiene una cotización activa.
            </p>
          )}

          <Field
            label="Vence"
            htmlFor="invitation-expires-at"
            required
            hint="Máximo 7 días desde hoy."
            error={fieldErrors.expiresAt}
          >
            <Input
              id="invitation-expires-at"
              type="datetime-local"
              value={expiresAt}
              max={maxExpiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              error={Boolean(fieldErrors.expiresAt)}
              required
            />
          </Field>

          {!allowed && blockedReason ? <p className="order-detail__hint">{blockedReason}</p> : null}

          <div className="order-detail__form-actions">
            <Button type="submit" loading={mutation.isPending} disabled={!allowed}>
              Crear invitación
            </Button>
          </div>
        </form>
      </CardBody>

      <Modal
        open={link !== null}
        onClose={() => {
          setLink(null);
          setCopied(false);
        }}
        title="Enlace de invitación"
      >
        <Alert tone="warning" title="Este enlace no se volverá a mostrar">
          Guárdalo ahora. El enlace demuestra posesión del enlace, no la identidad verificada de quien lo use.
        </Alert>
        <p className="order-detail__invitation-link">{link}</p>
        <Button type="button" onClick={() => void copyLink()}>
          {copied ? 'Copiado' : 'Copiar enlace'}
        </Button>
      </Modal>
    </Card>
  );
}
