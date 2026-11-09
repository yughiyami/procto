import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ApiError } from '@izumi/api-client';
import { ToastProvider } from '@izumi/ui';
import '@izumi/ui/styles.css';
import './styles/theme.css';
import { SessionProvider } from './session/SessionContext';
import { router } from './routes';
import { store } from './lib/apiClient';
import { TourProvider } from './tour/TourProvider';
import { registerSW } from './registerSW';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

registerSW();
void store.init();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionProvider>
          <TourProvider>
            <RouterProvider router={router} />
          </TourProvider>
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
