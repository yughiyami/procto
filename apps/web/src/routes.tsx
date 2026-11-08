import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
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
const InvitationPage = lazy(() => import('./pages/public/InvitationPage'));
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
      { path: '/proveedores', element: withSuspense(<SuppliersPage />) },
      { path: '/finanzas', element: withSuspense(<FinanceDashboardPage />) },
      { path: '/', element: <Navigate to="/inicio" replace /> },
    ],
  },
  { path: '*', errorElement: <RouteError />, element: withSuspense(<NotFoundPage />) },
]);
