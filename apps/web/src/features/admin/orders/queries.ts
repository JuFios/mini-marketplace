import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogKeys } from '@/features/catalog/queries';
import type { OrderStatus } from '@/shared/api/types';
import { adminKeys } from '../keys';
import { changeOrderStatus, fetchAdminOrder, fetchAdminOrders } from './api';
import { getStatusChangeErrorMessage } from './errors';
import type { AdminOrderFilters } from './filters';

export function useAdminOrdersQuery(filters: AdminOrderFilters) {
  return useQuery({
    queryKey: adminKeys.orderList(filters),
    queryFn: ({ signal }) => fetchAdminOrders(filters, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrderQuery(id: string) {
  return useQuery({
    queryKey: adminKeys.order(id),
    queryFn: ({ signal }) => fetchAdminOrder(id, signal),
  });
}

export function useChangeOrderStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: OrderStatus) => changeOrderStatus(id, status),
    onSuccess: (order) => {
      queryClient.setQueryData(adminKeys.order(id), order);
      void queryClient.invalidateQueries({ queryKey: adminKeys.orderLists });
      if (order.status === 'CANCELLED') {
        // The units went back into stock: product tables and the shop show stale numbers.
        void queryClient.invalidateQueries({ queryKey: adminKeys.products });
        void queryClient.invalidateQueries({ queryKey: catalogKeys.products });
      }
      toast.success('Order updated');
    },
    onError: (error) => {
      toast.error(getStatusChangeErrorMessage(error));
      // Show what the order is now, with the steps that are still possible.
      void queryClient.invalidateQueries({ queryKey: adminKeys.order(id) });
    },
  });
}
