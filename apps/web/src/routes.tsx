import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { PublicLayout } from './layout/PublicLayout';
import { RouteError } from './components/RouteError';

const HomePage = lazy(() => import('./pages/home/HomePage'));
const AccountPage = lazy(() => import('./pages/account/AccountPage'));
const OrdersListPage = lazy(() => import('./pages/orders/OrdersListPage'));
const OrderCreatePage = lazy(() => import('./pages/orders/OrderCreatePage'));
const OrderDetailPage = lazy(() => import('./pages/orders/OrderDetailPage'));
const OrderFinancePage = lazy(() => import('./pages/orders/OrderFinancePage'));
const OrderEvidencePage = lazy(() => import('./pages/orders/OrderEvidencePage'));
const SuppliersPage = lazy(() => import('./pages/suppliers/SuppliersPage'));
const FinanceDashboardPage = lazy(() => import('./pages/finance/FinanceDashboardPage'));
const LandingPage = lazy(() => import('./pages/landing/LandingPage'));
const ProviderPage = lazy(() => import('./pages/provider/ProviderPage'));
const InvestorPage = lazy(() => import('./pages/investor/InvestorPage'));
const ReceiptPage = lazy(() => import('./pages/receipt/ReceiptPage'));
const InvitationPage = lazy(() => import('./pages/public/InvitationPage'));
const DemoPage = lazy(() => import('./pages/demo/DemoPage'));
const VideoPage = lazy(() => import('./pages/video/VideoPage'));
const FichaPage = lazy(() => import('./pages/ficha/FichaPage'));
const GremiosPage = lazy(() => import('./pages/gremios/GremiosPage'));
const PacoPage = lazy(() => import('./pages/paco/PacoPage'));
const SalesPage = lazy(() => import('./pages/sales/SalesPage'));
const VoicePage = lazy(() => import('./pages/voice/VoicePage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const InboxPage = lazy(() => import('./pages/inbox/InboxPage'));
const IntegrationsPage = lazy(() => import('./pages/integrations/IntegrationsPage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
const ConversationPage = lazy(() => import('./pages/chat/ConversationPage'));
const AgentsPage = lazy(() => import('./pages/agents/AgentsPage'));
const AgentRunPage = lazy(() => import('./pages/agents/AgentRunPage'));
const DirectoryPage = lazy(() => import('./pages/directory/DirectoryPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<div className="route-loading">Cargando…</div>}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [{ path: '/i/:token', element: withSuspense(<InvitationPage />) }],
  },
  {
    errorElement: <RouteError />,
    children: [
      { path: '/', element: withSuspense(<LandingPage />) },
      { path: '/como-funciona', element: withSuspense(<LandingPage />) },
      { path: '/demo', element: withSuspense(<DemoPage />) },
      { path: '/video', element: withSuspense(<VideoPage />) },
      { path: '/ficha/:address', element: withSuspense(<FichaPage />) },
    ],
  },
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/inicio', element: withSuspense(<HomePage />) },
      { path: '/cuenta', element: withSuspense(<AccountPage />) },
      { path: '/orders', element: withSuspense(<OrdersListPage />) },
      { path: '/orders/nuevo', element: withSuspense(<OrderCreatePage />) },
      { path: '/orders/:id', element: withSuspense(<OrderDetailPage />) },
      { path: '/orders/:id/finanzas', element: withSuspense(<OrderFinancePage />) },
      { path: '/orders/:id/evidencia', element: withSuspense(<OrderEvidencePage />) },
      { path: '/proveedor', element: withSuspense(<ProviderPage />) },
      { path: '/adelantos', element: withSuspense(<InvestorPage />) },
      { path: '/orders/:id/comprobante', element: withSuspense(<ReceiptPage />) },
      { path: '/comprobante/:chainId', element: withSuspense(<ReceiptPage />) },
      { path: '/proveedores', element: withSuspense(<SuppliersPage />) },
      { path: '/finanzas', element: withSuspense(<FinanceDashboardPage />) },
      { path: '/gremios', element: withSuspense(<GremiosPage />) },
      { path: '/paco', element: withSuspense(<PacoPage />) },
      { path: '/ventas', element: withSuspense(<SalesPage />) },
      { path: '/voz', element: withSuspense(<VoicePage />) },
      { path: '/negocio', element: withSuspense(<ProfilePage />) },
      { path: '/bandeja', element: withSuspense(<InboxPage />) },
      { path: '/integraciones', element: withSuspense(<IntegrationsPage />) },
      { path: '/chat', element: withSuspense(<ChatPage />) },
      { path: '/chat/:id', element: withSuspense(<ConversationPage />) },
      { path: '/agentes', element: withSuspense(<AgentsPage />) },
      { path: '/agentes/ejecuciones/:id', element: withSuspense(<AgentRunPage />) },
      { path: '/directory', element: withSuspense(<DirectoryPage />) },
    ],
  },
  { path: '*', errorElement: <RouteError />, element: withSuspense(<NotFoundPage />) },
]);
