import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import type { MovementKind, Order, OrderStatus } from '@izumi/contracts';
import { ORDER_STATUSES, STATUS_LABELS, formatPen } from '@izumi/contracts';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Stat, Table } from '@izumi/ui';
import type { TableColumn } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './FinanceDashboardPage.css';

const KIND_LABELS: Record<MovementKind, string> = {
  customer_receipt: 'Cobro a cliente',
  supplier_payment: 'Pago a proveedor',
  other_cost: 'Otro costo',
  customer_refund: 'Reembolso a cliente',
};

/** Same warning text as apps/api/src/domain.ts `finance()` — this dashboard never invents its own wording. */
// Mirrors the `warning` string returned by finance() in apps/api/src/domain.ts.
// This dashboard aggregates client-side and never calls that endpoint, so the caveat
// is restated here rather than dropped.
const DOMAIN_WARNING =
  'La diferencia de caja no es utilidad: es solo cobros menos pagos registrados. La verificación es manual, no una conciliación bancaria.';

const MAX_ORDERS_RETURNED = 100;

type OrderFinanceRow = {
  order: Order;
  receivedNetCents: number;
  paidCostsCents: number;
  cashDifferenceCents: number;
  estimatedContributionCents: number | null;
};

/**
 * Reproduces apps/api/src/domain.ts `finance()` exactly, movement by movement:
 * customer_receipt adds to receipts, customer_refund subtracts from receipts,
 * every other kind is a paid cost. Getting this subtly different from the
 * backend would be worse than not building this dashboard at all.
 */
function computeOrderFinance(order: Order): OrderFinanceRow {
  let receipts = 0;
  let paid = 0;
  for (const movement of order.movements) {
    if (movement.kind === 'customer_receipt') receipts += movement.amountCents;
    else if (movement.kind === 'customer_refund') receipts -= movement.amountCents;
    else paid += movement.amountCents;
  }
  return {
    order,
    receivedNetCents: receipts,
    paidCostsCents: paid,
    cashDifferenceCents: receipts - paid,
    estimatedContributionCents: order.quote?.contributionCents ?? null,
  };
}

type SortKey = 'contribution' | 'cashDifference';

function sortRows(rows: OrderFinanceRow[], sortKey: SortKey): OrderFinanceRow[] {
  const withValue = (row: OrderFinanceRow) =>
    sortKey === 'contribution' ? row.estimatedContributionCents ?? Number.NEGATIVE_INFINITY : row.cashDifferenceCents;
  return [...rows].sort((a, b) => withValue(b) - withValue(a));
}

function StatusBreakdown({ rows }: { rows: OrderFinanceRow[] }) {
  const byStatus = new Map<OrderStatus, { count: number; cashDifferenceCents: number; paidCostsCents: number; receivedNetCents: number }>();
  for (const status of ORDER_STATUSES) byStatus.set(status, { count: 0, cashDifferenceCents: 0, paidCostsCents: 0, receivedNetCents: 0 });
  for (const row of rows) {
    const bucket = byStatus.get(row.order.status);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.cashDifferenceCents += row.cashDifferenceCents;
    bucket.paidCostsCents += row.paidCostsCents;
    bucket.receivedNetCents += row.receivedNetCents;
  }

  return (
    <Card>
      <CardHeader title="Desglose por estado del pedido" />
      <CardBody className="finance__status-grid">
        {ORDER_STATUSES.map((status) => {
          const bucket = byStatus.get(status);
          if (!bucket) return null;
          return (
            <div key={status} className="finance__status-card">
              <div className="finance__status-card-header">
                <Badge tone="neutral">{STATUS_LABELS[status]}</Badge>
                <span className="finance__status-count">{bucket.count} pedido(s)</span>
              </div>
              <dl className="finance__status-figures">
                <div>
                  <dt>Cobrado neto</dt>
                  <dd>{formatPen(bucket.receivedNetCents)}</dd>
                </div>
                <div>
                  <dt>Costos pagados</dt>
                  <dd>{formatPen(bucket.paidCostsCents)}</dd>
                </div>
                <div>
                  <dt>Diferencia de caja</dt>
                  <dd>{formatPen(bucket.cashDifferenceCents)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

function MovementsByKind({ orders }: { orders: Order[] }) {
  const subtotals = new Map<MovementKind, { count: number; totalCents: number }>();
  let declared = 0;
  let manuallyVerified = 0;
  for (const order of orders) {
    for (const movement of order.movements) {
      const bucket = subtotals.get(movement.kind) ?? { count: 0, totalCents: 0 };
      bucket.count += 1;
      bucket.totalCents += movement.amountCents;
      subtotals.set(movement.kind, bucket);
      if (movement.verification === 'manually_verified') manuallyVerified += 1;
      else declared += 1;
    }
  }
  const totalMovements = declared + manuallyVerified;

  return (
    <Card>
      <CardHeader title="Movimientos por tipo (todas las órdenes)" />
      <CardBody className="finance__movements-body">
        {subtotals.size === 0 ? (
          <EmptyState
            title="Aún no hay movimientos registrados"
            description="Los cobros, pagos y reembolsos de los pedidos aparecerán aquí."
          />
        ) : (
          <dl className="finance__kind-list">
            {Array.from(subtotals.entries()).map(([kind, bucket]) => (
              <div key={kind} className="finance__kind-item">
                <dt>
                  {KIND_LABELS[kind]} <span className="finance__kind-count">({bucket.count})</span>
                </dt>
                <dd>{formatPen(bucket.totalCents)}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="finance__verification-summary">
          <h3 className="finance__subsection-title">Verificación de movimientos</h3>
          <p className="finance__note">
            "Verificado manualmente" significa que una persona revisó el movimiento; ningún banco lo confirmó. Esta
            pantalla no concilia cuentas.
          </p>
          {totalMovements === 0 ? (
            <p className="finance__note">Sin movimientos que clasificar todavía.</p>
          ) : (
            <div className="finance__verification-badges">
              <Badge tone="warning">Declarados: {declared}</Badge>
              <Badge tone="success">Verificados manualmente: {manuallyVerified}</Badge>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function OrdersFinanceTable({ rows, sortKey, onSortKeyChange }: { rows: OrderFinanceRow[]; sortKey: SortKey; onSortKeyChange: (key: SortKey) => void }) {
  const sorted = useMemo(() => sortRows(rows, sortKey), [rows, sortKey]);

  const columns: TableColumn<OrderFinanceRow>[] = [
    { key: 'title', header: 'Pedido', render: (row) => <Link to={`/orders/${row.order.id}/finanzas`}>{row.order.title}</Link> },
    { key: 'status', header: 'Estado', render: (row) => <Badge tone="neutral">{STATUS_LABELS[row.order.status]}</Badge> },
    { key: 'received', header: 'Cobrado neto', render: (row) => formatPen(row.receivedNetCents), align: 'right' },
    { key: 'paid', header: 'Costos pagados', render: (row) => formatPen(row.paidCostsCents), align: 'right' },
    {
      key: 'cashDifference',
      header: 'Diferencia de caja',
      render: (row) => formatPen(row.cashDifferenceCents),
      align: 'right',
    },
    {
      key: 'contribution',
      header: 'Contribución estimada',
      render: (row) => (row.estimatedContributionCents === null ? 'Sin cotización' : formatPen(row.estimatedContributionCents)),
      align: 'right',
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Pedidos"
        actions={
          <label className="finance__sort-control">
            Ordenar por
            <Select
              aria-label="Ordenar pedidos por"
              value={sortKey}
              onChange={(event) => onSortKeyChange(event.target.value as SortKey)}
            >
              <option value="cashDifference">Diferencia de caja</option>
              <option value="contribution">Contribución estimada</option>
            </Select>
          </label>
        }
      />
      <CardBody>
        <div className="finance__desktop"><Table
          columns={columns}
          rows={sorted}
          keyExtractor={(row) => row.order.id}
          emptyContent={<EmptyState title="No hay pedidos para mostrar" />}
        /></div>
        <div className="finance__mobile">{sorted.map(row => <article key={row.order.id}>
          <h3><Link to={`/orders/${row.order.id}/finanzas`}>{row.order.title}</Link></h3>
          <Badge tone="neutral">{STATUS_LABELS[row.order.status]}</Badge>
          <dl><div><dt>Cobrado neto</dt><dd>{formatPen(row.receivedNetCents)}</dd></div>
          <div><dt>Costos pagados</dt><dd>{formatPen(row.paidCostsCents)}</dd></div>
          <div><dt>Diferencia de caja</dt><dd>{formatPen(row.cashDifferenceCents)}</dd></div></dl>
          <p className="finance__note">La diferencia de caja no es utilidad.</p>
        </article>)}</div>
      </CardBody>
    </Card>
  );
}

function Receivables({ rows }: { rows: OrderFinanceRow[] }) {
  const pending = rows.filter(row => row.order.accepted && row.order.status !== 'cancelled' && row.order.quote && row.order.quote.priceCents > row.receivedNetCents);
  return <Card><CardHeader title="Cobros pendientes" /><CardBody>
    <p className="finance__note">Saldo de pedidos aceptados menos cobros netos registrados. No equivale a deuda vencida: no tenemos una fecha contractual de pago.</p>
    {pending.length ? <div className="finance__receivables">{pending.map(row => <article key={row.order.id}>
      <h3>{row.order.title}</h3><strong>{formatPen(row.order.quote!.priceCents - row.receivedNetCents)}</strong>
      <p>{STATUS_LABELS[row.order.status]}</p>
      <Link to={`/orders/${row.order.id}/finanzas`}>Revisar / registrar cobro →</Link>
    </article>)}</div> : <p>No hay saldos pendientes en los pedidos aceptados cargados.</p>}
  </CardBody></Card>;
}

function FinanceDashboardContent({ orders }: { orders: Order[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('cashDifference');
  const rows = useMemo(() => orders.map(computeOrderFinance), [orders]);

  const totals = rows.reduce(
    (acc, row) => {
      acc.receivedNetCents += row.receivedNetCents;
      acc.paidCostsCents += row.paidCostsCents;
      acc.cashDifferenceCents += row.cashDifferenceCents;
      if (row.estimatedContributionCents !== null) {
        acc.estimatedContributionCents += row.estimatedContributionCents;
        acc.ordersWithQuote += 1;
      } else {
        acc.ordersWithoutQuote += 1;
      }
      return acc;
    },
    { receivedNetCents: 0, paidCostsCents: 0, cashDifferenceCents: 0, estimatedContributionCents: 0, ordersWithQuote: 0, ordersWithoutQuote: 0 },
  );

  const truncated = orders.length >= MAX_ORDERS_RETURNED;

  return (
    <div className="finance__body">
      <Alert tone="warning" title="Sobre estos totales">
        {DOMAIN_WARNING} La diferencia de caja no es utilidad ni ganancia: es solo cobros menos pagos registrados en
        Izumi. Estos totales cubren únicamente los movimientos registrados en Izumi — no hay conciliación bancaria
        automática, y "verificado manualmente" significa que una persona revisó el movimiento, no que un banco lo
        confirmó.
        {truncated ? (
          <>
            {' '}
            Además, esta pantalla solo lee hasta {MAX_ORDERS_RETURNED} pedidos (los más recientes). Con{' '}
            {orders.length} pedidos cargados, es posible que estos totales estén incompletos si tu organización tiene
            más pedidos que ese límite.
          </>
        ) : null}
      </Alert>

      <div className="finance__stats">
        <Stat label="Cobrado neto" value={formatPen(totals.receivedNetCents)} />
        <Stat label="Costos pagados" value={formatPen(totals.paidCostsCents)} />
        <Stat
          label="Diferencia de caja"
          value={formatPen(totals.cashDifferenceCents)}
          tone={totals.cashDifferenceCents < 0 ? 'danger' : 'neutral'}
          caption="No es utilidad ni ganancia."
        />
        <Stat
          label="Contribución estimada"
          value={formatPen(totals.estimatedContributionCents)}
          caption={`Suma de ${totals.ordersWithQuote} pedido(s) con cotización. ${totals.ordersWithoutQuote} sin cotización, no incluido(s).`}
        />
      </div>

      <Receivables rows={rows} />
      <details className="finance__advanced"><summary>Desglose por estado</summary><StatusBreakdown rows={rows} /></details>
      <OrdersFinanceTable rows={rows} sortKey={sortKey} onSortKeyChange={setSortKey} />
      <MovementsByKind orders={orders} />
    </div>
  );
}

export default function FinanceDashboardPage() {
  useDocumentTitle('Finanzas');

  const ordersQuery = useQuery({ queryKey: queryKeys.orders.all, queryFn: apiClient.listOrders });

  return (
    <div className="finance">
      <PageHeader
        title="Finanzas"
        subtitle="Vista agregada de cobros, pagos y contribución estimada de todos los pedidos. Calculada en el navegador a partir de los pedidos cargados; no reemplaza la conciliación bancaria."
      />
      <QueryBoundary
        query={ordersQuery}
        isEmpty={(data) => data.length === 0}
        emptyFallback={<EmptyState title="Aún no hay pedidos" description="Cuando existan pedidos, sus cifras aparecerán aquí." />}
      >
        {(orders) => <FinanceDashboardContent orders={orders} />}
      </QueryBoundary>
    </div>
  );
}
