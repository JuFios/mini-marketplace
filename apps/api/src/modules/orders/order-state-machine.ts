import { InvalidOrderTransitionException } from '../../common/exceptions/app.exception';
import { CancelReason, OrderStatus, PaymentStatus } from '../../generated/prisma/client';

/** Who asks for a change: the buyer, a shop administrator, or the system (payment processing). */
export type OrderActor = 'customer' | 'admin' | 'system';

/**
 * Every allowed move and who may make it. Typed over all statuses, so a status added to the enum
 * must be placed here before the code compiles. COMPLETED and CANCELLED are terminal.
 *
 * Administrators cannot move NEW to PROCESSING: an order is processed only once it is paid.
 */
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, readonly OrderActor[]>>> = {
  [OrderStatus.NEW]: {
    [OrderStatus.PROCESSING]: ['system'],
    [OrderStatus.CANCELLED]: ['customer', 'admin', 'system'],
  },
  [OrderStatus.PROCESSING]: {
    [OrderStatus.SHIPPED]: ['admin'],
    [OrderStatus.CANCELLED]: ['customer', 'admin'],
  },
  [OrderStatus.SHIPPED]: {
    [OrderStatus.COMPLETED]: ['admin'],
  },
  [OrderStatus.COMPLETED]: {},
  [OrderStatus.CANCELLED]: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

/** Throws `INVALID_ORDER_TRANSITION` (409) unless `actor` may move an order from `from` to `to`. */
export function assertTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): void {
  if (!canTransition(from, to, actor)) throw new InvalidOrderTransitionException(from, to);
}

/** The statuses `actor` may move this order to right now; empty once it is terminal. */
export function allowedTransitions(
  order: { status: OrderStatus },
  actor: OrderActor,
): OrderStatus[] {
  return Object.entries(TRANSITIONS[order.status])
    .filter(([, actors]) => actors.includes(actor))
    .map(([status]) => status as OrderStatus);
}

export interface CancellationOutcome {
  paymentStatus: PaymentStatus;
  cancelReason: CancelReason;
}

const CANCEL_REASONS: Record<OrderActor, CancelReason> = {
  customer: CancelReason.CUSTOMER_REQUEST,
  admin: CancelReason.ADMIN_ACTION,
  system: CancelReason.PAYMENT_FAILED,
};

/**
 * What a cancellation does to the payment. Money was taken only for a PROCESSING order, so only
 * that one is refunded; a NEW order is voided before any charge, unless the system cancels it
 * because the charge was declined. Call it for a transition `assertTransition` has accepted.
 */
export function cancellationOutcome(from: OrderStatus, actor: OrderActor): CancellationOutcome {
  const paymentStatus =
    from === OrderStatus.PROCESSING
      ? PaymentStatus.REFUNDED
      : actor === 'system'
        ? PaymentStatus.FAILED
        : PaymentStatus.VOIDED;
  return { paymentStatus, cancelReason: CANCEL_REASONS[actor] };
}
