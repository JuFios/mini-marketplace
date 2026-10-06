/** Hands committed orders over to asynchronous processing (payment, confirmation). */
export interface OrderEventsPublisher {
  /** Called once the checkout transaction has committed. */
  orderCreated(orderId: string): Promise<void>;
}

export const ORDER_EVENTS_PUBLISHER = Symbol('ORDER_EVENTS_PUBLISHER');
