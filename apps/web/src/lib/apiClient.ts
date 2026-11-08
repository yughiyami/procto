import { LocalStore, browserStorage } from '../store/localStore';
import { createLocalClient } from '../store/client';

/**
 * App-wide data client. PROCTO works offline-first: orders, suppliers and the
 * link to the on-chain payment live in the browser's LocalStore, so no server
 * is needed. The method surface matches the former HTTP client.
 */
export const store = new LocalStore(browserStorage());
export const apiClient = createLocalClient(store);
