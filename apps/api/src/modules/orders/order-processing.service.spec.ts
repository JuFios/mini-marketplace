import type { PinoLogger } from 'nestjs-pino';
import { InvalidOrderTransitionException } from '../../common/exceptions/app.exception';
import { OrderStatus, Prisma } from '../../generated/prisma/client';
import type { ChargeRequest, ChargeResult, PaymentProvider } from '../payments/payment-provider';
import type { OrderLifecycleService } from './order-lifecycle.service';
import type { OrderWithItems } from './mappers/to-order-response';
import { OrderProcessingService } from './order-processing.service';
import type { OrdersRepository } from './orders.repository';

const ORDER_ID = 'order-1';
const REF = 'mock_order-1';
const AMOUNT = new Prisma.Decimal('42.50');

function orderIn(status: OrderStatus): OrderWithItems {
  const at = new Date('2026-10-06T12:00:00.000Z');
  return {
    id: ORDER_ID,
    userId: 'user-1',
    status,
    paymentStatus: 'PENDING',
    paymentRef: null,
    totalAmount: AMOUNT,
    shippingAddress: '1 Main Street, Springfield',
    idempotencyKey: 'checkout-key-1',
    cancelReason: null,
    createdAt: at,
    updatedAt: at,
    items: [],
  };
}

const refused = () => new InvalidOrderTransitionException('CANCELLED', 'PROCESSING');

/**
 * `reads` are the states the order is found in, one per `findById` call: the first is the order
 * as the job sees it, the second what it is after a refused transition.
 */
function setup(reads: (OrderWithItems | null)[], charge: ChargeResult | Error) {
  const steps: string[] = [];
  let read = 0;
  const orders = {
    findById: jest.fn(() => {
      steps.push('read order');
      return Promise.resolve(reads[Math.min(read++, reads.length - 1)]);
    }),
  };
  const lifecycle = {
    markPaid: jest.fn((_id: string, _ref: string) => {
      steps.push('mark paid');
      return Promise.resolve();
    }),
    cancelDeclined: jest.fn((_id: string) => {
      steps.push('cancel declined');
      return Promise.resolve();
    }),
    refundCancelled: jest.fn((_id: string, _ref: string) => {
      steps.push('refund');
      return Promise.resolve(true);
    }),
  };
  const payments = {
    charge: jest.fn((_request: ChargeRequest) => {
      steps.push('charge');
      return charge instanceof Error ? Promise.reject(charge) : Promise.resolve(charge);
    }),
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn((fields: { event?: string }) => {
      if (fields.event) steps.push(`log ${fields.event}`);
    }),
    warn: jest.fn(),
  };
  const service = new OrderProcessingService(
    orders as unknown as OrdersRepository,
    lifecycle as unknown as OrderLifecycleService,
    payments satisfies PaymentProvider,
    logger as unknown as PinoLogger,
  );
  return { service, steps, orders, lifecycle, payments, logger };
}

const approved: ChargeResult = { status: 'approved', reference: REF };
const declined: ChargeResult = { status: 'declined', reason: 'CARD_DECLINED' };

describe('OrderProcessingService', () => {
  describe('a NEW order', () => {
    it('is charged for its total, marked paid, and confirmed', async () => {
      const { service, steps, payments } = setup([orderIn('NEW')], approved);

      await expect(service.process(ORDER_ID)).resolves.toBe('paid');

      expect(payments.charge).toHaveBeenCalledWith({ orderId: ORDER_ID, amount: AMOUNT });
      expect(steps).toEqual([
        'read order',
        'charge',
        'mark paid',
        'log order.processed',
        'log order.confirmation_sent',
      ]);
    });

    it('is paid with the reference the provider returned', async () => {
      const { service, lifecycle } = setup([orderIn('NEW')], approved);

      await service.process(ORDER_ID);

      expect(lifecycle.markPaid).toHaveBeenCalledWith(ORDER_ID, REF);
    });

    it('is cancelled, with its stock back, when the payment is declined', async () => {
      const { service, steps, lifecycle, logger } = setup([orderIn('NEW')], declined);

      await expect(service.process(ORDER_ID)).resolves.toBe('declined');

      expect(steps).toEqual([
        'read order',
        'charge',
        'cancel declined',
        'log order.payment_failed',
      ]);
      expect(lifecycle.markPaid).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID, reason: 'CARD_DECLINED' }),
        expect.any(String),
      );
    });

    it('is refunded when it was cancelled while the charge was in flight', async () => {
      const { service, steps, lifecycle } = setup([orderIn('NEW'), orderIn('CANCELLED')], approved);
      lifecycle.markPaid.mockRejectedValueOnce(refused());

      await expect(service.process(ORDER_ID)).resolves.toBe('refunded');

      expect(lifecycle.refundCancelled).toHaveBeenCalledWith(ORDER_ID, REF);
      expect(steps).toEqual(['read order', 'charge', 'read order', 'refund']);
      expect(steps).not.toContain('log order.processed');
    });

    it('does nothing more when a concurrent run already moved it on', async () => {
      const { service, lifecycle } = setup([orderIn('NEW'), orderIn('PROCESSING')], approved);
      lifecycle.markPaid.mockRejectedValueOnce(refused());

      await expect(service.process(ORDER_ID)).resolves.toBe('skipped');

      expect(lifecycle.refundCancelled).not.toHaveBeenCalled();
    });

    it('is not refunded twice: a refund that finds nothing to refund is a no-op', async () => {
      const { service, lifecycle } = setup([orderIn('NEW'), orderIn('CANCELLED')], approved);
      lifecycle.markPaid.mockRejectedValueOnce(refused());
      lifecycle.refundCancelled.mockResolvedValueOnce(false);

      await expect(service.process(ORDER_ID)).resolves.toBe('skipped');
    });

    it('is left alone when a decline finds it already cancelled by someone else', async () => {
      const { service, lifecycle, logger } = setup([orderIn('NEW')], declined);
      lifecycle.cancelDeclined.mockRejectedValueOnce(refused());

      await expect(service.process(ORDER_ID)).resolves.toBe('skipped');

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('an order that is not NEW', () => {
    it.each(['PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const)(
      'is not charged or changed when it is %s (a repeated or late job)',
      async (status) => {
        const { service, steps, payments, lifecycle } = setup([orderIn(status)], approved);

        await expect(service.process(ORDER_ID)).resolves.toBe('skipped');

        expect(steps).toEqual(['read order']);
        expect(payments.charge).not.toHaveBeenCalled();
        expect(lifecycle.markPaid).not.toHaveBeenCalled();
        expect(lifecycle.cancelDeclined).not.toHaveBeenCalled();
      },
    );

    it('is skipped, with a warning, when the order does not exist', async () => {
      const { service, payments, logger } = setup([null], approved);

      await expect(service.process(ORDER_ID)).resolves.toBe('skipped');

      expect(payments.charge).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('infrastructure errors', () => {
    it('are rethrown from the charge, so the queue retries, and nothing is written', async () => {
      const { service, steps, lifecycle } = setup([orderIn('NEW')], new Error('gateway timeout'));

      await expect(service.process(ORDER_ID)).rejects.toThrow('gateway timeout');

      expect(steps).toEqual(['read order', 'charge']);
      expect(lifecycle.markPaid).not.toHaveBeenCalled();
      expect(lifecycle.cancelDeclined).not.toHaveBeenCalled();
    });

    it('are rethrown from marking the order paid, and no confirmation is sent', async () => {
      const { service, steps, lifecycle } = setup([orderIn('NEW')], approved);
      lifecycle.markPaid.mockRejectedValueOnce(new Error('database unreachable'));

      await expect(service.process(ORDER_ID)).rejects.toThrow('database unreachable');

      expect(steps).not.toContain('log order.processed');
      expect(lifecycle.refundCancelled).not.toHaveBeenCalled();
    });

    it('are rethrown from cancelling a declined order', async () => {
      const { service, lifecycle } = setup([orderIn('NEW')], declined);
      lifecycle.cancelDeclined.mockRejectedValueOnce(new Error('database unreachable'));

      await expect(service.process(ORDER_ID)).rejects.toThrow('database unreachable');
    });

    it('are rethrown from the read of the order', async () => {
      const { service, orders } = setup([orderIn('NEW')], approved);
      orders.findById.mockRejectedValueOnce(new Error('database unreachable'));

      await expect(service.process(ORDER_ID)).rejects.toThrow('database unreachable');
    });
  });
});
