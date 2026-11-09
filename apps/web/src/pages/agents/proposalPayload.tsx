import type { ProposalKind, Supplier } from '@izumi/contracts';
import { formatDateTime, formatPen } from '@izumi/contracts';

/**
 * Every proposal payload arrives as `unknown` on the wire (see `AgentProposal.payload` in
 * @izumi/contracts). These readers narrow it field-by-field instead of trusting a cast, so a
 * malformed or unexpected payload degrades to "No disponible" per field rather than crashing
 * the approval screen a person is about to act on.
 */
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

const NOT_AVAILABLE = 'No disponible';

function formatDateSafe(value: string | null): string {
  if (value === null) return NOT_AVAILABLE;
  const parsed = formatDateTime(value);
  return parsed || NOT_AVAILABLE;
}

function formatMoneySafe(value: number | null): string {
  return value === null ? NOT_AVAILABLE : formatPen(value);
}

export type ContributionPayloadFields = {
  supplierId: string | null;
  specification: string | null;
  quantity: number | null;
  unitCostCents: number | null;
  availableAt: string | null;
  validUntil: string | null;
  confirmed: boolean | null;
};

export function readContributionPayload(payload: unknown): ContributionPayloadFields {
  const record = isRecord(payload) ? payload : {};
  return {
    supplierId: str(record.supplierId),
    specification: str(record.specification),
    quantity: num(record.quantity),
    unitCostCents: num(record.unitCostCents),
    availableAt: str(record.availableAt),
    validUntil: str(record.validUntil),
    confirmed: bool(record.confirmed),
  };
}

export type QuotePayloadFields = {
  priceCents: number | null;
  logisticsCents: number | null;
  coordinationCents: number | null;
  validUntil: string | null;
};

export function readQuotePayload(payload: unknown): QuotePayloadFields {
  const record = isRecord(payload) ? payload : {};
  return {
    priceCents: num(record.priceCents),
    logisticsCents: num(record.logisticsCents),
    coordinationCents: num(record.coordinationCents),
    validUntil: str(record.validUntil),
  };
}

export type OrderDraftPayloadFields = {
  title: string | null;
  specification: string | null;
  quantity: number | null;
  dueAt: string | null;
  ownQuantity: number | null;
  ownCostCents: number | null;
};

export function readOrderDraftPayload(payload: unknown): OrderDraftPayloadFields {
  const record = isRecord(payload) ? payload : {};
  return {
    title: str(record.title),
    specification: str(record.specification),
    quantity: num(record.quantity),
    dueAt: str(record.dueAt),
    ownQuantity: num(record.ownQuantity),
    ownCostCents: num(record.ownCostCents),
  };
}

export type MessagePayloadFields = {
  conversationId: string | null;
  body: string | null;
};

export function readMessagePayload(payload: unknown): MessagePayloadFields {
  const record = isRecord(payload) ? payload : {};
  return {
    conversationId: str(record.conversationId),
    body: str(record.body),
  };
}

function supplierName(suppliers: Supplier[], supplierId: string | null): string {
  if (supplierId === null) return NOT_AVAILABLE;
  const found = suppliers.find((supplier) => supplier.id === supplierId);
  return found ? found.name : `Proveedor ${supplierId}`;
}

export function ContributionPayloadView({ payload, suppliers }: { payload: unknown; suppliers: Supplier[] }) {
  const fields = readContributionPayload(payload);
  const lineTotal =
    fields.quantity !== null && fields.unitCostCents !== null ? fields.quantity * fields.unitCostCents : null;
  return (
    <dl className="agents__payload-fields">
      <div>
        <dt>Proveedor</dt>
        <dd>{supplierName(suppliers, fields.supplierId)}</dd>
      </div>
      <div>
        <dt>Especificación</dt>
        <dd>{fields.specification ?? NOT_AVAILABLE}</dd>
      </div>
      <div>
        <dt>Cantidad</dt>
        <dd>{fields.quantity ?? NOT_AVAILABLE}</dd>
      </div>
      <div>
        <dt>Costo unitario</dt>
        <dd>{formatMoneySafe(fields.unitCostCents)}</dd>
      </div>
      <div>
        <dt>Total de la línea</dt>
        <dd>{formatMoneySafe(lineTotal)}</dd>
      </div>
      <div>
        <dt>Disponible desde</dt>
        <dd>{formatDateSafe(fields.availableAt)}</dd>
      </div>
      <div>
        <dt>Válido hasta</dt>
        <dd>{formatDateSafe(fields.validUntil)}</dd>
      </div>
      <div>
        <dt>Confirmado por el proveedor</dt>
        <dd>{fields.confirmed === null ? NOT_AVAILABLE : fields.confirmed ? 'Sí' : 'No'}</dd>
      </div>
    </dl>
  );
}

export function QuotePayloadView({ payload }: { payload: unknown }) {
  const fields = readQuotePayload(payload);
  return (
    <dl className="agents__payload-fields">
      <div>
        <dt>Precio</dt>
        <dd>{formatMoneySafe(fields.priceCents)}</dd>
      </div>
      <div>
        <dt>Logística</dt>
        <dd>{formatMoneySafe(fields.logisticsCents)}</dd>
      </div>
      <div>
        <dt>Coordinación</dt>
        <dd>{formatMoneySafe(fields.coordinationCents)}</dd>
      </div>
      <div>
        <dt>Válida hasta</dt>
        <dd>{formatDateSafe(fields.validUntil)}</dd>
      </div>
    </dl>
  );
}

export function OrderDraftPayloadView({ payload }: { payload: unknown }) {
  const fields = readOrderDraftPayload(payload);
  return (
    <dl className="agents__payload-fields">
      <div>
        <dt>Título</dt>
        <dd>{fields.title ?? NOT_AVAILABLE}</dd>
      </div>
      <div>
        <dt>Especificación</dt>
        <dd>{fields.specification ?? NOT_AVAILABLE}</dd>
      </div>
      <div>
        <dt>Cantidad</dt>
        <dd>{fields.quantity ?? NOT_AVAILABLE}</dd>
      </div>
      <div>
        <dt>Fecha límite</dt>
        <dd>{formatDateSafe(fields.dueAt)}</dd>
      </div>
      <div>
        <dt>Aporte propio</dt>
        <dd>
          {fields.ownQuantity ?? 0} unidades · {formatMoneySafe(fields.ownCostCents ?? 0)}
        </dd>
      </div>
    </dl>
  );
}

export function MessagePayloadView({ payload }: { payload: unknown }) {
  const fields = readMessagePayload(payload);
  return (
    <div className="agents__payload-message">
      <p className="agents__payload-message-label">Mensaje que se enviaría, tal como está escrito:</p>
      <blockquote className="agents__payload-message-body">{fields.body ?? NOT_AVAILABLE}</blockquote>
    </div>
  );
}

export function ProposalPayloadView({
  kind,
  payload,
  suppliers,
}: {
  kind: ProposalKind;
  payload: unknown;
  suppliers: Supplier[];
}) {
  switch (kind) {
    case 'contribution':
      return <ContributionPayloadView payload={payload} suppliers={suppliers} />;
    case 'quote':
      return <QuotePayloadView payload={payload} />;
    case 'order_draft':
      return <OrderDraftPayloadView payload={payload} />;
    case 'message':
      return <MessagePayloadView payload={payload} />;
    default:
      return null;
  }
}

/** Concrete restatement of what approval will actually do, per proposal kind — shown in the approval confirm dialog. */
export function approvalSummary(kind: ProposalKind, payload: unknown, suppliers: Supplier[]): string {
  switch (kind) {
    case 'contribution': {
      const fields = readContributionPayload(payload);
      return `Se registrará el aporte de ${supplierName(suppliers, fields.supplierId)}: ${
        fields.quantity ?? NOT_AVAILABLE
      } unidades a ${formatMoneySafe(fields.unitCostCents)} cada una.`;
    }
    case 'quote': {
      const fields = readQuotePayload(payload);
      return `Se registrará la cotización: precio ${formatMoneySafe(fields.priceCents)}, logística ${formatMoneySafe(
        fields.logisticsCents,
      )}, coordinación ${formatMoneySafe(fields.coordinationCents)}, válida hasta ${formatDateSafe(
        fields.validUntil,
      )}.`;
    }
    case 'order_draft': {
      const fields = readOrderDraftPayload(payload);
      return `Se creará el pedido "${fields.title ?? NOT_AVAILABLE}": ${
        fields.quantity ?? NOT_AVAILABLE
      } unidades, con fecha límite ${formatDateSafe(fields.dueAt)}.`;
    }
    case 'message': {
      const fields = readMessagePayload(payload);
      return `Se pondrá en cola este mensaje para la conversación asociada (simulado o real según la configuración del canal). Consulta su estado en la conversación: "${
        fields.body ?? NOT_AVAILABLE
      }"`;
    }
    default:
      return 'Se aplicará esta propuesta al pedido.';
  }
}
