import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import type { Supplier } from '@izumi/contracts';
import { apiClient } from '../../../lib/apiClient';

/** Shared suppliers query — every panel that needs supplier names or a picker reuses this cache entry. */
export function useSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers.all,
    queryFn: () => apiClient.listSuppliers(),
  });
}

/**
 * Resolves a supplier id to its display name. Falls back to a shortened id
 * (never a raw UUID wall) while the list is loading or when the id is unknown.
 */
export function useSupplierNameResolver(suppliers: Supplier[] | undefined): (id: string) => string {
  const byId = useMemo(() => {
    const map = new Map<string, string>();
    for (const supplier of suppliers ?? []) map.set(supplier.id, supplier.name);
    return map;
  }, [suppliers]);

  return (id: string) => byId.get(id) ?? `Proveedor ${id.slice(0, 8)}`;
}
