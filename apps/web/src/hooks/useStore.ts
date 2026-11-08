import { useSyncExternalStore } from 'react';
import { store } from '../lib/apiClient';

/** Re-renders when the LocalStore changes; returns the store for reads. */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  return store;
}
