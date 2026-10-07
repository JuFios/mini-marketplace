import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { catalogKeys } from '@/features/catalog/queries';
import { cancelOrder, fetchOrder, fetchOrders } from './api';
import { getCancelErrorMessage } from './errors';
import type { OrderFilters } from './filters';
import { hasPollingTimedOut, orderPollInterval, ORDER_POLLING, type OrderPolling } from './polling';

export const orderKeys = {
  lists: ['orders', 'list'] as const,
  list: (filters: OrderFilters) => ['orders', 'list', filters] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};

export function useOrdersQuery(filters: OrderFilters) {
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: ({ signal }) => fetchOrders(filters, signal),
    // Keep showing the previous page while the next one loads instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });
}

/**
 * One order, re-read every `intervalMs` while it is `NEW` (the worker is charging it) until its
 * status changes or `windowMs` has passed. Time is measured from the last answer, not from a
 * timer, so the verdict is a plain function of the data and the page never reads the clock to
 * render.
 */
export function useOrderQuery(id: string, polling: OrderPolling = ORDER_POLLING) {
  const [startedAt] = useState(Date.now);
  const query = useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: ({ signal }) => fetchOrder(id, signal),
    refetchInterval: ({ state }) =>
      orderPollInterval(state.data, state.dataUpdatedAt - startedAt, polling),
  });
  return {
    query,
    pollingTimedOut: hasPollingTimedOut(query.data, query.dataUpdatedAt - startedAt, polling),
  };
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists });
      // The units are back in stock; every catalog view that shows them is out of date.
      void queryClient.invalidateQueries({ queryKey: catalogKeys.products });
      toast.success('Order cancelled');
    },
    onError: (error, orderId) => {
      toast.error(getCancelErrorMessage(error));
      // Show what the order is now, with the actions that are still possible.
      void queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
    },
  });
}
