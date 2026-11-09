import { LocalStore, browserStorage } from '../store/localStore';
import { createLocalClient } from '../store/client';
import { ExtrasStore } from '../store/extras';
import { createExtrasClient } from '../store/extrasClient';

/**
 * App-wide data client. PROCTO works offline-first: orders, suppliers and the
 * link to the on-chain payment live in the browser's LocalStore; chat, inbox, proposals,
 * directory and sales live in the ExtrasStore. No server is needed. The method surface
 * matches the former HTTP client.
 */
export const store = new LocalStore(browserStorage());
export const extras = new ExtrasStore(browserStorage());
const local = createLocalClient(store);
export const apiClient = { ...local, ...createExtrasClient(extras, local) };
