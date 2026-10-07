import type { Order, PaymentStatus } from '@/shared/api/types';

export interface OrderOutcome {
  tone: 'info' | 'success' | 'error';
  title: string;
  description: string;
  /** The payment result is still on its way: show that something is happening. */
  waiting: boolean;
}

type Described = Pick<Order, 'status' | 'paymentStatus' | 'cancelReason'>;

// What happened to the money, in a customer's words; empty when the order never got that far.
function paymentNote(status: PaymentStatus): string {
  switch (status) {
    case 'REFUNDED':
      return 'Your payment has been refunded.';
    case 'VOIDED':
    case 'FAILED':
      return 'You were not charged.';
    case 'PENDING':
    case 'PAID':
      return '';
  }
}

function describeCancelled({ cancelReason, paymentStatus }: Described): OrderOutcome {
  if (cancelReason === 'PAYMENT_FAILED') {
    return {
      tone: 'error',
      title: 'Payment was declined',
      description:
        'The order was cancelled and the items are back in stock. You were not charged; you can try again from the catalog.',
      waiting: false,
    };
  }
  const base =
    cancelReason === 'ADMIN_ACTION'
      ? 'The shop cancelled this order and the items are back in stock.'
      : 'This order was cancelled and the items are back in stock.';
  return {
    tone: 'info',
    title: 'Order cancelled',
    description: `${base} ${paymentNote(paymentStatus)}`.trim(),
    waiting: false,
  };
}

/** The headline for an order: what the payment and the shop have done with it so far. */
export function describeOutcome(order: Described, pollingTimedOut = false): OrderOutcome {
  switch (order.status) {
    case 'NEW':
      return pollingTimedOut
        ? {
            tone: 'info',
            title: 'Still waiting for the payment result',
            description:
              'This is taking longer than usual. Your order is saved and will be processed automatically; check back in a few minutes.',
            waiting: false,
          }
        : {
            tone: 'info',
            title: 'Confirming your payment…',
            description:
              'This usually takes a few seconds. You can leave this page: your order is saved.',
            waiting: true,
          };
    case 'PROCESSING':
      return {
        tone: 'success',
        title: 'Payment received',
        description: 'Thank you! Your order is being prepared.',
        waiting: false,
      };
    case 'SHIPPED':
      return {
        tone: 'info',
        title: 'Your order has been shipped',
        description: 'It is on its way to the address below.',
        waiting: false,
      };
    case 'COMPLETED':
      return {
        tone: 'success',
        title: 'Order completed',
        description: 'Thank you for your purchase.',
        waiting: false,
      };
    case 'CANCELLED':
      return describeCancelled(order);
  }
}
