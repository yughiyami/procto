import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import type { MovementKind, Order, Finance } from '@izumi/contracts';
import { formatPen } from '@izumi/contracts';
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList, EmptyState, PageHeader, Stat, Table } from '@izumi/ui';
import type { DescriptionListItem, TableColumn } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './OrderFinancePage.css';
import FinancialDraftPanel from '../finance/FinancialDraftPanel';

const KIND_LABELS: Record<MovementKind, string> = {
  customer_receipt: 'Cobro a cliente',
  supplier_payment: 'Pago a proveedor',
  other_cost: 'Otro costo',
  customer_refund: 'Reembolso a cliente',
};

type MovementRow = Order['movements'][number];

function MovementsSection({ orderId, order }: { orderId: string; order: Order }) {
  const columns: TableColumn<MovementRow>[] = [
    { key: 'kind', header: 'Tipo', render: (m) => KIND_LABELS[m.kind] },
    { key: 'amount', header: 'Monto', render: (m) => formatPen(m.amountCents), align: 'right' },
    { key: 'reference', header: 'Referencia', render: (m) => m.reference },
    { key: 'counterparty', header: 'Contraparte', render: (m) => m.counterparty || '—' },
    {
      key: 'verification',
      header: 'Verificación',
      render: (m) => (
        <Badge tone={m.verification === 'manually_verified' ? 'success' : 'warning'}>
          {m.verification === 'manually_verified' ? 'Verificado manualmente' : 'Declarado'}
        </Badge>
      ),
    },
    { key: 'note', header: 'Nota', render: (m) => m.note || '—' },
  ];

  const subtotalsByKind = new Map<MovementKind, number>();
  for (const movement of order.movements) {
    subtotalsByKind.set(movement.kind, (subtotalsByKind.get(movement.kind) ?? 0) + movement.amountCents);
  }
  const subtotalItems: DescriptionListItem[] = Array.from(subtotalsByKind.entries()).map(([kind, total]) => ({
    key: kind,
    term: KIND_LABELS[kind],
    detail: formatPen(total),
  }));

  return (
    <Card>
      <CardHeader title="Movimientos registrados" />
      <CardBody className="order-finance__movements">
        <Table
          columns={columns}
          rows={order.movements}
          keyExtractor={(m) => m.id}
          emptyContent={
            <EmptyState
              title="Aún no hay movimientos registrados"
              description="Los cobros, pagos y reembolsos de este pedido aparecerán aquí."
            />
          }
        />
        {subtotalItems.length > 0 ? (
          <div className="order-finance__subtotals">
            <h3 className="order-finance__subtotals-title">Subtotales por tipo</h3>
            <DescriptionList items={subtotalItems} />
          </div>
        ) : null}
        <p className="order-finance__note">
          "Verificado manualmente" significa que una persona revisó el movimiento, no que un banco lo confirmó. Esta
          página solo registra movimientos; no concilia cuentas.
        </p>
        <Link to={`/orders/${orderId}?seccion=cash`} className="izu-button izu-button--secondary">
          Registrar un movimiento en el detalle del pedido
        </Link>
      </CardBody>
    </Card>
  );
}

function OrderFinanceContent({ orderId, order, finance }: { orderId: string; order: Order; finance: Finance }) {
  return (
    <>
      <div className="order-finance__stats">
        <Stat label="Cobrado neto" value={formatPen(finance.receivedNetCents)} />
        <Stat label="Costos pagados" value={formatPen(finance.paidCostsCents)} />
        <Stat
          label="Diferencia de caja"
          value={formatPen(finance.cashDifferenceCents)}
          tone={finance.cashDifferenceCents < 0 ? 'danger' : 'neutral'}
          caption="No es utilidad ni ganancia."
        />
        <Stat
          label="Contribución estimada"
          value={
            finance.estimatedContributionCents === null ? 'Sin cotización' : formatPen(finance.estimatedContributionCents)
          }
          caption="Estimación, no un resultado confirmado."
        />
        <Stat
          label="Saldo del cliente"
          value={finance.customerBalanceCents === null ? 'Sin cotización' : formatPen(finance.customerBalanceCents)}
        />
      </div>

      <Alert tone="warning" title="Sobre la diferencia de caja">
        {finance.warning}
      </Alert>

      {['accepted', 'fulfilling', 'delivered', 'cancelled'].includes(order.status) && <FinancialDraftPanel orderId={orderId} />}
      <MovementsSection orderId={orderId} order={order} />
    </>
  );
}

export default function OrderFinancePage() {
  const { id } = useParams();
  const orderId = id ?? '';
  useDocumentTitle('Finanzas del pedido');

  const financeQuery = useQuery({
    queryKey: queryKeys.orders.finance(orderId),
    queryFn: () => apiClient.getFinance(orderId),
    enabled: orderId !== '',
  });
  const orderQuery = useQuery({
    queryKey: queryKeys.orders.detail(orderId),
    queryFn: () => apiClient.getOrder(orderId),
    enabled: orderId !== '',
  });

  return (
    <div className="order-finance">
      <PageHeader
        title="Finanzas del pedido"
        breadcrumb={<Link to={`/orders/${orderId}`}>← Volver al pedido</Link>}
      />
      <QueryBoundary query={financeQuery}>
        {(finance) => (
          <QueryBoundary query={orderQuery}>
            {(order) => <OrderFinanceContent orderId={orderId} order={order} finance={finance} />}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </div>
  );
}
