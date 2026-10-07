import { http } from '@/shared/api/client';
import type { Order, OrderSummary, Paginated } from '@/shared/api/types';
import { toApiParams, type OrderFilters } from './filters';

export async function fetchOrders(
  filters: OrderFilters,
  signal?: AbortSignal,
): Promise<Paginated<OrderSummary>> {
  const { data } = await http.get<Paginated<OrderSummary>>('/orders', {
    params: toApiParams(filters),
    signal,
  });
  return data;
}

export async function fetchOrder(id: string, signal?: AbortSignal): Promise<Order> {
  const { data } = await http.get<Order>(`/orders/${encodeURIComponent(id)}`, { signal });
  return data;
}

/** Not idempotent on the server: a second cancel of the same order is a 409. */
export async function cancelOrder(id: string): Promise<Order> {
  const { data } = await http.post<Order>(`/orders/${encodeURIComponent(id)}/cancel`);
  return data;
}
