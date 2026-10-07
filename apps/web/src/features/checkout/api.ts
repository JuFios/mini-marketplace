import { http } from '@/shared/api/client';
import type { Order } from '@/shared/api/types';

/**
 * Buys the whole cart. The same `idempotencyKey` always yields the same order: a repeat answers
 * 200 with the order as it is now instead of creating a second one.
 */
export async function placeOrder(shippingAddress: string, idempotencyKey: string): Promise<Order> {
  const { data } = await http.post<Order>(
    '/orders',
    { shippingAddress },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data;
}
