import { createIzumiClient } from '@izumi/api-client';
import { clearToken, getToken } from '../auth/tokenStorage';

const DEFAULT_API_URL = 'http://localhost:3017';

/**
 * Single app-wide client instance. `getToken` is read lazily on every request
 * (not captured once) so a sign-in during the session is picked up immediately.
 *
 * ASSUMPTION for @izumi/api-client: `createIzumiClient` accepts
 * `{ baseUrl, getToken, onUnauthorized }` and every generated request calls
 * `getToken()` fresh and invokes `onUnauthorized()` exactly once per 401
 * response (before throwing the ApiError). Confirm this shape with the
 * api-client author.
 */
export const apiClient = createIzumiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
  getToken,
  onUnauthorized: () => {
    clearToken();
    // Hard redirect avoids depending on router context from outside React.
    if (!['/login', '/mobile-demo'].includes(window.location.pathname)) {
      window.location.assign('/login');
    }
  },
});
