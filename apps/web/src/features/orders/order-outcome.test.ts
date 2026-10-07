import { describe, expect, it } from 'vitest';
import type { Order } from '@/shared/api/types';
import { describeOutcome } from './order-outcome';

type Case = Pick<Order, 'status' | 'paymentStatus' | 'cancelReason'>;

const NEW: Case = { status: 'NEW', paymentStatus: 'PENDING', cancelReason: null };

describe('an order waiting for its payment', () => {
  it('says the payment is being confirmed and that something is happening', () => {
    expect(describeOutcome(NEW)).toMatchObject({
      tone: 'info',
      title: 'Confirming your payment…',
      waiting: true,
    });
  });

  it('stops promising a few seconds once polling has given up', () => {
    const outcome = describeOutcome(NEW, true);

    expect(outcome.title).toBe('Still waiting for the payment result');
    expect(outcome.description).toContain('check back in a few minutes');
    expect(outcome.waiting).toBe(false);
  });
});

describe('an order past payment', () => {
  it('confirms a received payment', () => {
    expect(
      describeOutcome({ status: 'PROCESSING', paymentStatus: 'PAID', cancelReason: null }),
    ).toMatchObject({ tone: 'success', title: 'Payment received', waiting: false });
  });

  it('follows the order through shipping and completion', () => {
    const shipped = describeOutcome({
      status: 'SHIPPED',
      paymentStatus: 'PAID',
      cancelReason: null,
    });
    const completed = describeOutcome({
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      cancelReason: null,
    });

    expect(shipped.title).toBe('Your order has been shipped');
    expect(completed).toMatchObject({ tone: 'success', title: 'Order completed' });
  });
});

describe('a cancelled order', () => {
  it('reports a declined payment as an error, with the stock back and nothing charged', () => {
    const outcome = describeOutcome({
      status: 'CANCELLED',
      paymentStatus: 'FAILED',
      cancelReason: 'PAYMENT_FAILED',
    });

    expect(outcome.tone).toBe('error');
    expect(outcome.title).toBe('Payment was declined');
    expect(outcome.description).toContain('back in stock');
    expect(outcome.description).toContain('You were not charged');
  });

  it('says a customer cancellation before payment cost nothing', () => {
    const outcome = describeOutcome({
      status: 'CANCELLED',
      paymentStatus: 'VOIDED',
      cancelReason: 'CUSTOMER_REQUEST',
    });

    expect(outcome).toMatchObject({ tone: 'info', title: 'Order cancelled' });
    expect(outcome.description).toBe(
      'This order was cancelled and the items are back in stock. You were not charged.',
    );
  });

  it('says a payment was refunded when the cancellation came after it', () => {
    const outcome = describeOutcome({
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      cancelReason: 'CUSTOMER_REQUEST',
    });

    expect(outcome.description).toBe(
      'This order was cancelled and the items are back in stock. Your payment has been refunded.',
    );
  });

  it('names the shop when it was the one that cancelled', () => {
    const outcome = describeOutcome({
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      cancelReason: 'ADMIN_ACTION',
    });

    expect(outcome.description).toBe(
      'The shop cancelled this order and the items are back in stock. Your payment has been refunded.',
    );
  });
});
