import { http } from '@/shared/api/client';
import type { AdminOrder, AdminOrderSummary, OrderStatus, Paginated } from '@/shared/api/types';
import { toApiParams, type AdminOrderFilters } from './filters';

export async function fetchAdminOrders(
  filters: AdminOrderFilters,
  signal?: AbortSignal,
): Promise<Paginated<AdminOrderSummary>> {
  const { data } = await http.get<Paginated<AdminOrderSummary>>('/admin/orders', {
    params: toApiParams(filters),
    signal,
  });
  return data;
}

export async function fetchAdminOrder(id: string, signal?: AbortSignal): Promise<AdminOrder> {
  const { data } = await http.get<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}`, {
    signal,
  });
  return data;
}

/** Only `SHIPPED`, `COMPLETED` and `CANCELLED` can succeed; the order's `allowedTransitions` say which now. */
export async function changeOrderStatus(id: string, status: OrderStatus): Promise<AdminOrder> {
  const { data } = await http.patch<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}/status`, {
    status,
  });
  return data;
}
