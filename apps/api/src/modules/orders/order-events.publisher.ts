import { Injectable } from '@nestjs/common';

/** Hands committed orders over to asynchronous processing (payment, confirmation). */
export interface OrderEventsPublisher {
  /** Called once the checkout transaction has committed. */
  orderCreated(orderId: string): Promise<void>;
}

export const ORDER_EVENTS_PUBLISHER = Symbol('ORDER_EVENTS_PUBLISHER');

/**
 * Stand-in until orders are processed by a queue: placing an order hands nothing over yet, and
 * every order stays `NEW` / `PENDING`.
 */
@Injectable()
export class NoopOrderEventsPublisher implements OrderEventsPublisher {
  orderCreated(): Promise<void> {
    return Promise.resolve();
  }
}
