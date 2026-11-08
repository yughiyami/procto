import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queryKeys } from '@izumi/api-client';
import type { Order } from '@izumi/contracts';
import { STATUS_LABELS, formatDate, formatPen } from '@izumi/contracts';
import { Icon, PageHeader } from '@izumi/ui';
import { QueryBoundary } from '../../components/QueryBoundary';
import { apiClient } from '../../lib/apiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSession, ROLES } from '../../session/SessionContext';
import './HomePage.css';

function nextStep(order: Order): string {
  if (order.status === 'draft') return 'Completa los aportes de los talleres y prepara la cotización.';
  if (order.status === 'quoted') return 'Cotización lista: el comprador la acepta y se activa el cobro protegido.';
  if (order.status === 'accepted' || order.status === 'fulfilling') return 'Cobro protegido: deposita, entrega y confirma.';
  return 'Revisa el comprobante del pedido.';
}

export default function HomePage() {
  useDocumentTitle('Inicio');
  const { role } = useSession();
  const roleInfo = ROLES.find((r) => r.id === role)!;
  const query = useQuery({ queryKey: queryKeys.orders.all, queryFn: apiClient.listOrders });
  return (
    <div className="home-page">
      <PageHeader
        title={`Hola, ${roleInfo.label.toLowerCase()}`}
        subtitle={roleInfo.description}
        actions={
          role === 'coordinadora' ? (
            <Link to="/orders/nuevo" className="izu-button izu-button--primary">
              <Icon name="plus" />
              Nuevo pedido
            </Link>
          ) : undefined
        }
      />
      {role === 'proveedor' && (
        <Link className="home-callout" to="/proveedor">
          <strong>Mis cobros</strong>
          <span>Mira cuánto te deben, avisa tus entregas y pide un adelanto.</span>
        </Link>
      )}
      {role === 'inversionista' && (
        <Link className="home-callout" to="/adelantos">
          <strong>Adelantos disponibles</strong>
          <span>Financia el tiempo de entrega de pagos que ya están depositados.</span>
        </Link>
      )}
      <QueryBoundary query={query}>
        {(orders) => (
          <section className="home-section" aria-labelledby="orders-title">
            <h2 id="orders-title">Pedidos</h2>
            <ul className="home-tasks">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link to={`/orders/${order.id}`}>
                    <div>
                      <span className="home-task-state">
                        {STATUS_LABELS[order.status]} · entrega {formatDate(order.dueAt)}
                      </span>
                      <h3>{order.title}</h3>
                      <p>
                        {order.quote ? `${formatPen(order.quote.priceCents)} · ` : ''}
                        {nextStep(order)}
                      </p>
                    </div>
                    <Icon name="chevron-right" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </QueryBoundary>
      <p className="home-footnote">
        <Link to="/como-funciona">Cómo funciona PROCTO</Link>
      </p>
    </div>
  );
}
