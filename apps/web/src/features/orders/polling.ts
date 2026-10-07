import type { Order } from '@/shared/api/types';

export interface OrderPolling {
  intervalMs: number;
  /** How long after opening the page the order is asked about again while it is still `NEW`. */
  windowMs: number;
}

export const ORDER_POLLING: OrderPolling = { intervalMs: 2_000, windowMs: 30_000 };

/**
 * How long to wait before asking about the order again, or `false` to stop. Only a `NEW` order has
 * anything left to happen on its own (the worker's payment result); once it is past `NEW` the
 * customer or an administrator moves it, and the page learns of that when it is next opened.
 * `elapsedMs` is the time since the page began watching.
 */
export function orderPollInterval(
  order: Pick<Order, 'status'> | undefined,
  elapsedMs: number,
  polling: OrderPolling = ORDER_POLLING,
): number | false {
  if (order?.status !== 'NEW') return false;
  return elapsedMs < polling.windowMs ? polling.intervalMs : false;
}

/** The payment result did not arrive within the window: the order is still `NEW` and polling stopped. */
export function hasPollingTimedOut(
  order: Pick<Order, 'status'> | undefined,
  elapsedMs: number,
  polling: OrderPolling = ORDER_POLLING,
): boolean {
  return order?.status === 'NEW' && orderPollInterval(order, elapsedMs, polling) === false;
}
