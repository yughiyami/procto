import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import type { Order, OrderStatus } from '@izumi/contracts';
import { ORDER_STATUSES, STATUS_LABELS, formatDate, isFuture } from '@izumi/contracts';
import { Badge, EmptyState, Input, PageHeader, Table } from '@izumi/ui';
import type { TableColumn } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './OrdersListPage.css';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  draft: 'neutral',
  quoted: 'info',
  accepted: 'success',
  fulfilling: 'info',
  delivered: 'success',
  cancelled: 'danger',
};

function isKnownStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

function coverageOf(order: Order): { assigned: number; percent: number; missing: number } {
  const contributed = order.contributions.reduce((sum, c) => sum + c.quantity, 0);
  const assigned = order.ownQuantity + contributed;
  const percent = order.quantity > 0 ? Math.min(100, Math.round((assigned / order.quantity) * 100)) : 0;
  const missing = Math.max(order.quantity - assigned, 0);
  return { assigned, percent, missing };
}

function CoverageCell({ order }: { order: Order }) {
  const { assigned, percent, missing } = coverageOf(order);
  return (
    <div className="orders-list__coverage">
      <div className="orders-list__coverage-bar" role="img" aria-label={`Cobertura ${percent} por ciento`}>
        <div className="orders-list__coverage-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="orders-list__coverage-text">
        {assigned} / {order.quantity} unidades
        {missing > 0 ? ` · faltan ${missing} unidades` : ''}
      </span>
    </div>
  );
}

function AlertsCell({ order }: { order: Order }) {
  const overdue = order.status !== 'delivered' && order.status !== 'cancelled' && Date.parse(order.dueAt) < Date.now();
  const quoteExpired = order.status === 'quoted' && order.quote != null && !isFuture(order.quote.validUntil);

  if (!overdue && !quoteExpired) {
    return <span className="orders-list__muted">—</span>;
  }

  return (
    <div className="orders-list__urgency">
      {overdue ? <Badge tone="danger">Vencido</Badge> : null}
      {quoteExpired ? <p className="orders-list__urgency-text">La cotización venció; requiere reconfirmar</p> : null}
    </div>
  );
}

function FilterBar({
  activeStatuses,
  onToggleStatus,
  searchText,
  onSearchChange,
}: {
  activeStatuses: OrderStatus[];
  onToggleStatus: (status: OrderStatus) => void;
  searchText: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="orders-list__filters">
      <div className="orders-list__chips" role="group" aria-label="Filtrar por estado">
        {ORDER_STATUSES.map((status) => {
          const active = activeStatuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              className={`orders-list__chip${active ? ' orders-list__chip--active' : ''}`}
              aria-pressed={active}
              onClick={() => onToggleStatus(status)}
            >
              {STATUS_LABELS[status]}
            </button>
          );
        })}
      </div>
      <label className="orders-list__search-label" htmlFor="orders-list-search">
        Buscar por título o especificación
      </label>
      <Input
        id="orders-list-search"
        type="search"
        placeholder="Ej. camisetas algodón…"
        value={searchText}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </div>
  );
}

function OrdersListContent({ orders }: { orders: Order[] }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeStatuses = (searchParams.get('estado') ?? '')
    .split(',')
    .filter((value): value is OrderStatus => value.length > 0 && isKnownStatus(value));
  const searchText = searchParams.get('q') ?? '';
  const overdueOnly = searchParams.get('vencidos') === '1';

  function updateParams(next: { estado?: OrderStatus[]; q?: string }) {
    const params = new URLSearchParams(searchParams);
    if (next.estado !== undefined) {
      if (next.estado.length === 0) params.delete('estado');
      else params.set('estado', next.estado.join(','));
    }
    if (next.q !== undefined) {
      if (next.q === '') params.delete('q');
      else params.set('q', next.q);
    }
    setSearchParams(params, { replace: true });
  }

  function toggleStatus(status: OrderStatus) {
    const next = activeStatuses.includes(status)
      ? activeStatuses.filter((s) => s !== status)
      : [...activeStatuses, status];
    updateParams({ estado: next });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  const normalizedQuery = searchText.trim().toLowerCase();
  const now = Date.now();
  const filtered = orders.filter((order) => {
    const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(order.status);
    const matchesText =
      normalizedQuery === '' ||
      order.title.toLowerCase().includes(normalizedQuery) ||
      order.specification.toLowerCase().includes(normalizedQuery);
    const matchesOverdue = !overdueOnly || (
      order.status !== 'delivered' && order.status !== 'cancelled' && Date.parse(order.dueAt) < now
    );
    return matchesStatus && matchesText && matchesOverdue;
  });

  const columns: TableColumn<Order>[] = [
    {
      key: 'title',
      header: 'Pedido',
      render: (order) => (
        <Link to={`/orders/${order.id}`} className="orders-list__title-link">
          <span className="orders-list__title">{order.title}</span>
          <span className="orders-list__spec">{order.specification}</span>
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (order) => <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABELS[order.status]}</Badge>,
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      render: (order) => order.quantity,
      align: 'right',
    },
    {
      key: 'dueAt',
      header: 'Entrega',
      render: (order) => formatDate(order.dueAt),
    },
    {
      key: 'coverage',
      header: 'Cobertura',
      render: (order) => <CoverageCell order={order} />,
    },
    {
      key: 'alerts',
      header: 'Alertas',
      render: (order) => <AlertsCell order={order} />,
    },
  ];

  return (
    <>
      <FilterBar
        activeStatuses={activeStatuses}
        onToggleStatus={toggleStatus}
        searchText={searchText}
        onSearchChange={(value) => updateParams({ q: value })}
      />
      {overdueOnly && <p role="status">Solo pedidos activos con entrega vencida.{' '}<button type="button" className="orders-list__clear" onClick={() => { const params = new URLSearchParams(searchParams); params.delete('vencidos'); setSearchParams(params, { replace: true }); }}>Quitar filtro de vencidos</button></p>}
      {filtered.length === 0 ? (
        <EmptyState
          title="No encontramos pedidos con estos filtros"
          description="Prueba con otro texto de búsqueda o quita algunos filtros de estado."
          action={
            <button type="button" className="orders-list__clear" onClick={clearFilters}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <>
          <div className="orders-list__desktop"><Table columns={columns} rows={filtered} keyExtractor={(order) => order.id} /></div>
          <div className="orders-list__mobile">
            {filtered.map(order => <article className="orders-list__card" key={order.id}>
              <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABELS[order.status]}</Badge>
              <h2><Link to={`/orders/${order.id}`}>{order.title}</Link></h2>
              <p>{order.quantity} unidades · Entrega {formatDate(order.dueAt)}</p>
              <CoverageCell order={order} /><AlertsCell order={order} />
              <Link className="orders-list__open" to={`/orders/${order.id}`}>Coordinar pedido →</Link>
            </article>)}
          </div>
        </>
      )}
    </>
  );
}

export default function OrdersListPage() {
  useDocumentTitle('Pedidos');
  const query = useQuery({ queryKey: queryKeys.orders.all, queryFn: apiClient.listOrders });

  return (
    <div className="orders-list">
      <PageHeader
        title="Pedidos"
        actions={
          <Link to="/orders/nuevo" className="izu-button izu-button--primary">
            Nuevo pedido
          </Link>
        }
      />
      <QueryBoundary
        query={query}
        isEmpty={(orders) => orders.length === 0}
        emptyFallback={
          <EmptyState
            title="Aún no tienes pedidos"
            description="Crea tu primer pedido para empezar a coordinar proveedores y clientes."
            action={
              <Link to="/orders/nuevo" className="izu-button izu-button--primary">
                Crear pedido
              </Link>
            }
          />
        }
      >
        {(orders) => <OrdersListContent orders={orders} />}
      </QueryBoundary>
    </div>
  );
}
