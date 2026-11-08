import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import { PageHeader } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ProtectedPaymentPanel } from './detail/ProtectedPaymentPanel';
import { OrderSummary } from './detail/OrderSummary';
import { FeasibilityPanel } from './detail/FeasibilityPanel';
import { ContributionsSection } from './detail/ContributionsSection';
import { QuotePanel } from './detail/QuotePanel';
import { AcceptancePanel } from './detail/AcceptancePanel';
import { DeliveriesSection } from './detail/DeliveriesSection';
import { MovementsSection } from './detail/MovementsSection';
import { InvitationsPanel } from './detail/InvitationsPanel';
import { DangerZone } from './detail/DangerZone';
import './OrderDetailPage.css';

/**
 * /orders/:id — the coordination screen. Its job is to make the blocking reason as visible
 * as the "ready to quote" state (see FeasibilityPanel). Data fetching, mutation-driven
 * invalidation, and layout live here; every panel below is pure presentation.
 */
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [section, setSection] = useState<'payment' | 'coordinate' | 'delivery' | 'cash' | 'advanced' | null>(params.get('seccion') === 'cash' ? 'cash' : null);

  const orderQuery = useQuery({
    queryKey: id ? queryKeys.orders.detail(id) : queryKeys.orders.all,
    queryFn: () => apiClient.getOrder(id ?? ''),
    enabled: Boolean(id),
  });

  const feasibilityQuery = useQuery({
    queryKey: id ? queryKeys.orders.feasibility(id) : queryKeys.orders.all,
    queryFn: () => apiClient.getFeasibility(id ?? ''),
    enabled: Boolean(id),
  });

  function invalidateOrder() {
    if (!id) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.feasibility(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
  }

  useDocumentTitle(orderQuery.data?.title ?? 'Pedido');

  if (!id) {
    return (
      <p role="alert" className="order-detail__missing-id">
        Falta el identificador del pedido en la URL.
      </p>
    );
  }

  return (
    <div className="order-detail">
      <PageHeader
        title={orderQuery.data?.title ?? 'Pedido'}
        breadcrumb={<Link to="/orders">← Pedidos</Link>}
        actions={
          <div className="order-detail__header-links">
            <Link to={`/orders/${id}/finanzas`}>Finanzas</Link>
            <Link to={`/orders/${id}/comprobante`}>Comprobante</Link>
            <Link to={`/orders/${id}/evidencia`}>Registro interno</Link>
          </div>
        }
      />

      <QueryBoundary query={orderQuery}>
        {(order) => (
          <QueryBoundary query={feasibilityQuery}>
            {(feasibility) => {
              const active = section ?? (order.accepted ? 'payment' : 'coordinate');
              return (
              <>
              <nav className="order-detail__sections" aria-label="Secciones del pedido">
                {([['payment', 'Cobro protegido'], ['coordinate', 'Coordinar'], ['delivery', 'Entregar'], ['cash', 'Caja'], ['advanced', 'Compartir / más']] as const).map(([key, label]) =>
                  <button key={key} type="button" aria-pressed={active === key} onClick={() => setSection(key)}>{label}</button>)}
              </nav>
              <div className="order-detail__grid">
                <OrderSummary order={order} />
                <div hidden={active !== 'payment'}><ProtectedPaymentPanel order={order} /></div>
                <div className="order-detail__section-body" hidden={active !== 'coordinate'}>
                <FeasibilityPanel order={order} feasibility={feasibility} />
                <ContributionsSection order={order} feasibility={feasibility} onChanged={invalidateOrder} />
                <QuotePanel order={order} feasibility={feasibility} onChanged={invalidateOrder} />
                <AcceptancePanel order={order} onChanged={invalidateOrder} />
                </div>
                <div hidden={active !== 'delivery'}><DeliveriesSection order={order} onChanged={invalidateOrder} /></div>
                <div hidden={active !== 'cash'}><MovementsSection order={order} onChanged={invalidateOrder} /></div>
                <div className="order-detail__section-body" hidden={active !== 'advanced'}>
                <InvitationsPanel order={order} onChanged={invalidateOrder} />
                <DangerZone order={order} onChanged={invalidateOrder} />
                </div>
              </div>
              </>
              );
            }}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </div>
  );
}
