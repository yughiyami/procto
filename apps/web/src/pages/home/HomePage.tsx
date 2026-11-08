import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queryKeys } from '@izumi/api-client';
import type { Order } from '@izumi/contracts';
import { STATUS_LABELS, formatDate } from '@izumi/contracts';
import { Icon, PageHeader } from '@izumi/ui';
import { QueryBoundary } from '../../components/QueryBoundary';
import { apiClient } from '../../lib/apiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './HomePage.css';

function attention(order: Order, now: number): string | null {
  if (order.status === 'cancelled' || order.status === 'delivered') return null;
  if (Date.parse(order.dueAt) < now) return 'La fecha de entrega pasó: revisa el compromiso';
  if (order.status === 'quoted' && order.quote && Date.parse(order.quote.validUntil) < now) return 'Cotización vencida: reconfirma antes de aceptar';
  if (order.status === 'draft') return 'Completa los aportes y prepara una cotización';
  if (order.status === 'accepted' || order.status === 'fulfilling') return 'Coordina los aportes y registra la entrega';
  return 'Espera o registra la respuesta del cliente';
}

function Today({ orders }: { orders: Order[] }) {
  const now = Date.now();
  const active = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const late = active.filter((o) => Date.parse(o.dueAt) < now);
  const pending = active.filter((o) => o.status === 'quoted');
  const tasks = [...active].sort((a,b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)).slice(0,5);
  return <>
    <div className="home-stats" aria-label="Resumen de pedidos cargados">
      <Link to="/orders?estado=draft,quoted,accepted,fulfilling"><strong>{active.length}</strong><span>Pedidos activos</span></Link>
      <Link to="/orders?estado=quoted"><strong>{pending.length}</strong><span>Por confirmar</span></Link>
      <Link to="/orders?vencidos=1"><strong>{late.length}</strong><span>Entrega vencida</span></Link>
    </div>
    {orders.length >= 100 && <p role="status">Resumen limitado a los últimos 100 pedidos devueltos por el servidor; no representa todo tu historial.</p>}
    <section className="home-section" aria-labelledby="today-title">
      <h2 id="today-title">Qué necesita tu atención</h2>
      <p>Prioridad por fecha de entrega. Una alerta no significa una venta perdida.</p>
      {tasks.length ? <ul className="home-tasks">{tasks.map((order) => <li key={order.id}>
        <Link to={`/orders/${order.id}`}><div><span className="home-task-state">{STATUS_LABELS[order.status]} · {formatDate(order.dueAt)}</span><h3>{order.title}</h3><p>{attention(order,now)}</p></div><Icon name="chevron-right" /></Link>
      </li>)}</ul> : <div className="home-empty"><Icon name="check-circle" size="lg" /><h3>{orders.length ? 'Sin pedidos activos' : 'Tu primer pedido empieza aquí'}</h3><p>{orders.length ? 'Puedes revisar tu historial o buscar nuevas oportunidades.' : 'Registra lo que necesita tu cliente y reúne los aportes de tu red.'}</p><Link to="/orders/nuevo">Crear un pedido</Link></div>}
      {active.length > 5 && <Link className="home-more" to="/orders">Ver todos los pedidos activos</Link>}
    </section>
  </>;
}

export default function HomePage() {
  useDocumentTitle('Inicio');
  const query = useQuery({ queryKey: queryKeys.orders.all, queryFn: apiClient.listOrders, refetchInterval:60000 });
  return <div className="home-page">
    <PageHeader title="Tu negocio, en orden" actions={<Link to="/orders/nuevo" className="izu-button izu-button--primary"><Icon name="plus" />Nuevo pedido</Link>} />
    <p className="home-intro">Encuentra oportunidades, coordina tu red y lleva tus cobros al día.</p>
    <QueryBoundary query={query}>{(orders) => <Today orders={orders} />}</QueryBoundary>
    <section className="home-section" aria-labelledby="shortcuts-title"><h2 id="shortcuts-title">Continúa desde aquí</h2>
      <div className="home-shortcuts">
        <Link to="/directory"><Icon name="search" /><div><strong>Buscar oportunidades</strong><span>Compradores y proveedores con su fuente</span></div><Icon name="chevron-right" /></Link>
        <Link to="/chat"><Icon name="chat" /><div><strong>Hablar con tu cliente</strong><span>Conversaciones y seguimiento por WhatsApp</span></div><Icon name="chevron-right" /></Link>
        <Link to="/finanzas"><Icon name="finance" /><div><strong>Revisar caja</strong><span>Cobros y pagos registrados por pedido</span></div><Icon name="chevron-right" /></Link>
        <Link to="/agentes"><Icon name="agents" /><div><strong>Revisar propuestas de PACO</strong><span>La IA propone; tú confirmas los cambios</span></div><Icon name="chevron-right" /></Link>
      </div>
    </section>
  </div>;
}
