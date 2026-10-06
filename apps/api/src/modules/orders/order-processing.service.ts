import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { InvalidOrderTransitionException } from '../../common/exceptions/app.exception';
import { OrderStatus } from '../../generated/prisma/client';
import { PAYMENT_PROVIDER } from '../payments/payment-provider';
import type { PaymentProvider } from '../payments/payment-provider';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersRepository } from './orders.repository';

/** What processing an order came to; the queue does not use it, logs and tests do. */
export type ProcessingOutcome =
  | 'paid'
  | 'declined'
  /** Paid, but the customer had cancelled meanwhile: the charge was refunded. */
  | 'refunded'
  /** Nothing to do: the order was not NEW (already processed or cancelled) or another run won. */
  | 'skipped';

/**
 * Takes payment for a NEW order. Safe to run any number of times for one order, one after the
 * other or at once: only the first run that finds the order NEW acts on it, and everything it
 * writes is a conditional update, so duplicates (a retried job, the sweeper re-adding a job
 * whose predecessor is still running) end up as no-ops. The charge itself is idempotent per
 * order, so a duplicate that reaches the provider changes nothing there either.
 *
 * Errors other than a refused transition are not caught: the queue retries the job with backoff.
 */
@Injectable()
export class OrderProcessingService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly lifecycle: OrderLifecycleService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(OrderProcessingService.name);
  }

  async process(orderId: string): Promise<ProcessingOutcome> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      this.logger.warn({ orderId }, 'Order to process not found');
      return 'skipped';
    }
    if (order.status !== OrderStatus.NEW) return 'skipped';

    const result = await this.payments.charge({ orderId, amount: order.totalAmount });
    if (result.status === 'declined') return this.decline(orderId, result.reason);
    return this.settle(orderId, result.reference);
  }

  private async settle(orderId: string, paymentRef: string): Promise<ProcessingOutcome> {
    try {
      await this.lifecycle.markPaid(orderId, paymentRef);
    } catch (error) {
      if (!(error instanceof InvalidOrderTransitionException)) throw error;
      // The order left NEW while the charge was being made. Cancelled: the customer (or an
      // administrator) won and the stock is already back, so the money just taken is returned.
      // Anything else: a concurrent run of this job got there first, and there is nothing to do.
      const current = await this.orders.findById(orderId);
      if (current?.status !== OrderStatus.CANCELLED) return 'skipped';
      return (await this.lifecycle.refundCancelled(orderId, paymentRef)) ? 'refunded' : 'skipped';
    }

    this.logger.info({ event: 'order.processed', orderId, paymentRef }, 'Order paid');
    // A stand-in for the mail: the customer's address is deliberately not logged.
    this.logger.info({ event: 'order.confirmation_sent', orderId }, 'Order confirmation sent');
    return 'paid';
  }

  private async decline(orderId: string, reason: string): Promise<ProcessingOutcome> {
    try {
      await this.lifecycle.cancelDeclined(orderId);
    } catch (error) {
      if (!(error instanceof InvalidOrderTransitionException)) throw error;
      // Already cancelled by someone else, which restocked: nothing left to undo.
      return 'skipped';
    }
    this.logger.info({ event: 'order.payment_failed', orderId, reason }, 'Payment declined');
    return 'declined';
  }
}
