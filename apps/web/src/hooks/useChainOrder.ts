import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChainOrder, getOrderEvents } from '../stellar/chain';

export const chainOrderKey = (id: string) => ['chain-order', id] as const;
export const chainEventsKey = (id: string) => ['chain-events', id] as const;

/** Live state of a protected order read straight from the contract. */
export function useChainOrder(chainOrderId: string | undefined) {
  return useQuery({
    queryKey: chainOrderKey(chainOrderId ?? 'none'),
    queryFn: () => getChainOrder(chainOrderId!),
    enabled: Boolean(chainOrderId),
    refetchInterval: 10_000,
  });
}

export function useChainEvents(chainOrderId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chainEventsKey(chainOrderId ?? 'none'),
    queryFn: () => getOrderEvents(chainOrderId!),
    enabled: Boolean(chainOrderId) && enabled,
    staleTime: 15_000,
  });
}

export function useRefreshChain() {
  const queryClient = useQueryClient();
  return (chainOrderId: string) => {
    void queryClient.invalidateQueries({ queryKey: chainOrderKey(chainOrderId) });
    void queryClient.invalidateQueries({ queryKey: chainEventsKey(chainOrderId) });
    void queryClient.invalidateQueries({ queryKey: ['balance'] });
    void queryClient.invalidateQueries({ queryKey: ['chain-orders'] });
  };
}
