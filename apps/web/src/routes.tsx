import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { PublicLayout } from './layout/PublicLayout';
import { RouteError } from './components/RouteError';

// Page modules are owned by other agents and do not exist on disk yet — that
// is expected. Paths must match the route map in docs/frontend-contract.md
// exactly; do not rename or stub them.
const SalesPage = lazy(() => import('./pages/sales/SalesPage'));
const DemoPage = lazy(() => import('./pages/demo/DemoPage'));
const VoicePage = lazy(() => import('./pages/voice/VoicePage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const HomePage = lazy(() => import('./pages/home/HomePage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const MobileDemoPage = lazy(() => import('./pages/auth/MobileDemoPage'));
const OrdersListPage = lazy(() => import('./pages/orders/OrdersListPage'));
const OrderCreatePage = lazy(() => import('./pages/orders/OrderCreatePage'));
const OrderDetailPage = lazy(() => import('./pages/orders/OrderDetailPage'));
const OrderFinancePage = lazy(() => import('./pages/orders/OrderFinancePage'));
const OrderEvidencePage = lazy(() => import('./pages/orders/OrderEvidencePage'));
const SuppliersPage = lazy(() => import('./pages/suppliers/SuppliersPage'));
const InboxPage = lazy(() => import('./pages/inbox/InboxPage'));
const IntegrationsPage = lazy(() => import('./pages/integrations/IntegrationsPage'));
const InvitationPage = lazy(() => import('./pages/public/InvitationPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
const ConversationPage = lazy(() => import('./pages/chat/ConversationPage'));
const AgentsPage = lazy(() => import('./pages/agents/AgentsPage'));
const AgentRunPage = lazy(() => import('./pages/agents/AgentRunPage'));
const FinanceDashboardPage = lazy(() => import('./pages/finance/FinanceDashboardPage'));
const DirectoryPage = lazy(() => import('./pages/directory/DirectoryPage'));
const BlockchainPage = lazy(() => import('./pages/blockchain/BlockchainPage'));

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<div className="route-loading">Cargando…</div>}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: withSuspense(<LoginPage />) },
      { path: '/mobile-demo', element: withSuspense(<MobileDemoPage />) },
      { path: '/i/:token', element: withSuspense(<InvitationPage />) },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: withSuspense(<HomePage />) },
          { path: '/ventas', element: withSuspense(<SalesPage />) },
          { path: '/demo', element: withSuspense(<DemoPage />) },
          { path: '/voz', element: withSuspense(<VoicePage />) },
          { path: '/negocio', element: withSuspense(<ProfilePage />) },
          { path: '/orders', element: withSuspense(<OrdersListPage />) },
          { path: '/orders/nuevo', element: withSuspense(<OrderCreatePage />) },
          { path: '/orders/:id', element: withSuspense(<OrderDetailPage />) },
          { path: '/orders/:id/finanzas', element: withSuspense(<OrderFinancePage />) },
          { path: '/orders/:id/evidencia', element: withSuspense(<OrderEvidencePage />) },
          { path: '/proveedores', element: withSuspense(<SuppliersPage />) },
          { path: '/bandeja', element: withSuspense(<InboxPage />) },
          { path: '/integraciones', element: withSuspense(<IntegrationsPage />) },
          { path: '/chat', element: withSuspense(<ChatPage />) },
          { path: '/chat/:id', element: withSuspense(<ConversationPage />) },
          { path: '/agentes', element: withSuspense(<AgentsPage />) },
          { path: '/agentes/ejecuciones/:id', element: withSuspense(<AgentRunPage />) },
          { path: '/finanzas', element: withSuspense(<FinanceDashboardPage />) },
          { path: '/directory', element: withSuspense(<DirectoryPage />) },
          { path: '/blockchain', element: withSuspense(<BlockchainPage />) },
        ],
      },
    ],
  },
  {
    path: '*',
    errorElement: <RouteError />,
    element: withSuspense(<NotFoundPage />),
  },
]);
