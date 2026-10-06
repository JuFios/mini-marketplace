import type { PinoLogger } from 'nestjs-pino';
import { OrderStatus, PaymentStatus, Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { CatalogCacheService } from '../catalog-cache/catalog-cache.service';
import type { InventoryRepository } from './inventory.repository';
import type { OrderWithCustomer } from './mappers/to-order-response';
import { OrderLifecycleService } from './order-lifecycle.service';
import type { OrdersRepository, StatusChange } from './orders.repository';

const USER = 'user-1';
const ADMIN = 'admin-1';
const ORDER_ID = 'order-1';

const A = '0000000a-0000-4000-8000-000000000000';
const B = '0000000b-0000-4000-8000-000000000000';

function orderIn(status: OrderStatus, paymentStatus: PaymentStatus = 'PENDING'): OrderWithCustomer {
  const at = new Date('2026-10-06T12:00:00.000Z');
  return {
    id: ORDER_ID,
    userId: USER,
    status,
    paymentStatus,
    paymentRef: null,
    totalAmount: new Prisma.Decimal('13.00'),
    shippingAddress: '1 Main Street, Springfield',
    idempotencyKey: 'checkout-key-1',
    cancelReason: null,
    createdAt: at,
    updatedAt: at,
    items: [
      {
        id: 'item-a',
        orderId: ORDER_ID,
        productId: A,
        productName: 'Alpha',
        unitPrice: new Prisma.Decimal('5.00'),
        quantity: 2,
      },
      {
        id: 'item-b',
        orderId: ORDER_ID,
        productId: B,
        productName: 'Bravo',
        unitPrice: new Prisma.Decimal('3.00'),
        quantity: 1,
      },
    ],
    user: { id: USER, email: 'ann@example.com', name: 'Ann' },
  };
}

/**
 * Wires the service to mocks that record, in order, every step they see. The order the loaders
 * return is the stored one: `moved` says whether the conditional update finds the order still in
 * the status it was read in (false = another request changed it first, to `now`).
 */
function setup(
  stored: OrderWithCustomer | null,
  options: { moved?: boolean; now?: OrderStatus } = {},
) {
  const { moved = true, now = OrderStatus.PROCESSING } = options;
  const steps: string[] = [];
  const tx = { opaque: 'transaction client' };
  let changed: StatusChange | undefined;
  let reads = 0;

  const prisma = {
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => {
      steps.push('begin');
      const result = await run(tx);
      steps.push('commit');
      return result;
    }),
  };
  const orders = {
    findOwn: jest.fn(
      (userId: string, _id: string, client?: unknown): Promise<OrderWithCustomer | null> => {
        steps.push(client === tx ? 'read' : 'read outside transaction');
        return Promise.resolve(stored && stored.userId === userId ? view(stored) : null);
      },
    ),
    findWithCustomer: jest.fn(
      (_id: string, client?: unknown): Promise<OrderWithCustomer | null> => {
        steps.push(client === tx ? 'read' : 'read outside transaction');
        return Promise.resolve(stored && view(stored));
      },
    ),
    findById: jest.fn((_id: string, client?: unknown): Promise<OrderWithCustomer | null> => {
      steps.push(client === tx ? 'read' : 'read outside transaction');
      return Promise.resolve(stored && view(stored));
    }),
    markRefunded: jest.fn((_id: string, _ref: string) => Promise.resolve(true)),
    changeStatus: jest.fn((_id: string, from: OrderStatus, change: StatusChange) => {
      steps.push(`update ${from} → ${change.status}`);
      changed = moved ? change : undefined;
      return Promise.resolve(moved);
    }),
  };

  // The first read is the order as stored, later ones what the database holds after the update
  // (or, when the update lost a race, the status the winner left).
  function view(order: OrderWithCustomer): OrderWithCustomer {
    reads += 1;
    if (reads === 1) return order;
    return changed ? { ...order, ...changed } : { ...order, status: now };
  }

  const inventory = {
    restock: jest.fn(() => {
      steps.push('restock');
      return Promise.resolve();
    }),
  };
  const catalogCache = {
    invalidate: jest.fn(() => {
      steps.push('invalidate cache');
      return Promise.resolve();
    }),
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn((fields: { event?: string }) => {
      if (fields.event) steps.push(`log ${fields.event}`);
    }),
  };

  const service = new OrderLifecycleService(
    prisma as unknown as PrismaService,
    orders as unknown as OrdersRepository,
    inventory as unknown as InventoryRepository,
    catalogCache as unknown as CatalogCacheService,
    logger as unknown as PinoLogger,
  );
  return { service, steps, tx, orders, inventory, catalogCache, logger };
}

describe('OrderLifecycleService', () => {
  describe('a customer cancels', () => {
    it('a NEW order: voids the payment, puts the stock back, and only then invalidates the cache and logs', async () => {
      const { service, steps, orders, inventory, tx } = setup(orderIn('NEW'));

      const response = await service.cancelOwn(USER, ORDER_ID);

      expect(steps).toEqual([
        'begin',
        'read',
        'update NEW → CANCELLED',
        'restock',
        'read',
        'commit',
        'invalidate cache',
        'log order.status_changed',
        'log order.cancelled',
      ]);
      expect(orders.findOwn).toHaveBeenCalledWith(USER, ORDER_ID, tx);
      expect(orders.changeStatus).toHaveBeenCalledWith(
        ORDER_ID,
        'NEW',
        { status: 'CANCELLED', paymentStatus: 'VOIDED', cancelReason: 'CUSTOMER_REQUEST' },
        tx,
      );
      expect(inventory.restock).toHaveBeenCalledWith(
        [
          expect.objectContaining({ productId: A, quantity: 2 }),
          expect.objectContaining({ productId: B, quantity: 1 }),
        ],
        tx,
      );
      expect(response).toMatchObject({
        id: ORDER_ID,
        status: 'CANCELLED',
        paymentStatus: 'VOIDED',
        cancelReason: 'CUSTOMER_REQUEST',
        allowedTransitions: [],
      });
    });

    it('a PROCESSING order: refunds the payment', async () => {
      const { service, orders } = setup(orderIn('PROCESSING', 'PAID'));

      const response = await service.cancelOwn(USER, ORDER_ID);

      expect(orders.changeStatus).toHaveBeenCalledWith(
        ORDER_ID,
        'PROCESSING',
        { status: 'CANCELLED', paymentStatus: 'REFUNDED', cancelReason: 'CUSTOMER_REQUEST' },
        expect.anything(),
      );
      expect(response).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    });

    it('logs who cancelled what, without the address', async () => {
      const { service, logger } = setup(orderIn('NEW'));

      await service.cancelOwn(USER, ORDER_ID);

      expect(logger.info).toHaveBeenNthCalledWith(
        1,
        {
          event: 'order.status_changed',
          orderId: ORDER_ID,
          from: 'NEW',
          to: 'CANCELLED',
          actor: 'customer',
          actorId: USER,
        },
        expect.any(String),
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        2,
        {
          event: 'order.cancelled',
          orderId: ORDER_ID,
          actor: 'customer',
          actorId: USER,
          cancelReason: 'CUSTOMER_REQUEST',
          paymentStatus: 'VOIDED',
          unitsRestocked: 3,
        },
        expect.any(String),
      );
    });

    it("someone else's order is 404 ORDER_NOT_FOUND and nothing is written", async () => {
      const { service, steps } = setup(orderIn('NEW'));

      await expect(service.cancelOwn('another-user', ORDER_ID)).rejects.toMatchObject({
        httpStatus: 404,
        code: 'ORDER_NOT_FOUND',
      });
      expect(steps).toEqual(['begin', 'read']);
    });

    it.each(['SHIPPED', 'COMPLETED', 'CANCELLED'] as const)(
      'a %s order is refused with 409 and nothing is written, restocked, invalidated or logged',
      async (status) => {
        const { service, steps } = setup(orderIn(status));

        await expect(service.cancelOwn(USER, ORDER_ID)).rejects.toMatchObject({
          httpStatus: 409,
          code: 'INVALID_ORDER_TRANSITION',
          details: { currentStatus: status, requestedStatus: 'CANCELLED' },
        });
        expect(steps).toEqual(['begin', 'read']);
      },
    );

    it('loses a race: the order was changed first, so there is no restock, no cache bump, no log and no commit', async () => {
      const { service, steps } = setup(orderIn('NEW'), { moved: false, now: 'CANCELLED' });

      await expect(service.cancelOwn(USER, ORDER_ID)).rejects.toMatchObject({
        httpStatus: 409,
        code: 'INVALID_ORDER_TRANSITION',
        details: { currentStatus: 'CANCELLED', requestedStatus: 'CANCELLED' },
      });
      expect(steps).toEqual(['begin', 'read', 'update NEW → CANCELLED', 'read']);
    });
  });

  describe('an administrator changes the status', () => {
    it('ships a PROCESSING order: only the status changes, stock and cache are left alone', async () => {
      const { service, steps, orders } = setup(orderIn('PROCESSING', 'PAID'));

      const response = await service.changeStatus(ORDER_ID, 'SHIPPED', ADMIN);

      expect(steps).toEqual([
        'begin',
        'read',
        'update PROCESSING → SHIPPED',
        'read',
        'commit',
        'log order.status_changed',
      ]);
      expect(orders.changeStatus).toHaveBeenCalledWith(
        ORDER_ID,
        'PROCESSING',
        { status: 'SHIPPED' },
        expect.anything(),
      );
      expect(response).toMatchObject({
        status: 'SHIPPED',
        paymentStatus: 'PAID',
        allowedTransitions: ['COMPLETED'],
        customer: { id: USER, email: 'ann@example.com', name: 'Ann' },
      });
    });

    it('completes a SHIPPED order', async () => {
      const { service } = setup(orderIn('SHIPPED', 'PAID'));

      await expect(service.changeStatus(ORDER_ID, 'COMPLETED', ADMIN)).resolves.toMatchObject({
        status: 'COMPLETED',
        allowedTransitions: [],
      });
    });

    it('cancels a PROCESSING order as an administrator: ADMIN_ACTION, refund, restock, cache', async () => {
      const { service, steps, orders } = setup(orderIn('PROCESSING', 'PAID'));

      await service.changeStatus(ORDER_ID, 'CANCELLED', ADMIN);

      expect(steps).toEqual([
        'begin',
        'read',
        'update PROCESSING → CANCELLED',
        'restock',
        'read',
        'commit',
        'invalidate cache',
        'log order.status_changed',
        'log order.cancelled',
      ]);
      expect(orders.changeStatus).toHaveBeenCalledWith(
        ORDER_ID,
        'PROCESSING',
        { status: 'CANCELLED', paymentStatus: 'REFUNDED', cancelReason: 'ADMIN_ACTION' },
        expect.anything(),
      );
    });

    it('cancels a NEW order: the payment is voided', async () => {
      const { service, orders } = setup(orderIn('NEW'));

      await service.changeStatus(ORDER_ID, 'CANCELLED', ADMIN);

      expect(orders.changeStatus).toHaveBeenCalledWith(
        ORDER_ID,
        'NEW',
        { status: 'CANCELLED', paymentStatus: 'VOIDED', cancelReason: 'ADMIN_ACTION' },
        expect.anything(),
      );
    });

    it.each([
      ['NEW', 'PROCESSING'],
      ['NEW', 'SHIPPED'],
      ['NEW', 'COMPLETED'],
      ['PROCESSING', 'PROCESSING'],
      ['PROCESSING', 'COMPLETED'],
      ['PROCESSING', 'NEW'],
      ['SHIPPED', 'CANCELLED'],
      ['SHIPPED', 'SHIPPED'],
      ['COMPLETED', 'CANCELLED'],
      ['CANCELLED', 'PROCESSING'],
    ] as const)('refuses %s → %s with 409 and writes nothing', async (from, to) => {
      const { service, steps } = setup(orderIn(from));

      await expect(service.changeStatus(ORDER_ID, to, ADMIN)).rejects.toMatchObject({
        httpStatus: 409,
        code: 'INVALID_ORDER_TRANSITION',
        details: { currentStatus: from, requestedStatus: to },
      });
      expect(steps).toEqual(['begin', 'read']);
    });

    it('a missing order is 404 ORDER_NOT_FOUND', async () => {
      const { service } = setup(null);

      await expect(service.changeStatus(ORDER_ID, 'SHIPPED', ADMIN)).rejects.toMatchObject({
        httpStatus: 404,
        code: 'ORDER_NOT_FOUND',
      });
    });

    it('loses a race to a customer cancelling: 409 naming the status the order has now', async () => {
      const { service, steps, inventory } = setup(orderIn('PROCESSING', 'PAID'), {
        moved: false,
        now: 'CANCELLED',
      });

      await expect(service.changeStatus(ORDER_ID, 'SHIPPED', ADMIN)).rejects.toMatchObject({
        httpStatus: 409,
        details: { currentStatus: 'CANCELLED', requestedStatus: 'SHIPPED' },
      });
      expect(inventory.restock).not.toHaveBeenCalled();
      expect(steps).not.toContain('commit');
    });
  });

  describe('the system, while processing a payment', () => {
    it('marks a NEW order paid: PROCESSING with the payment reference, no restock, no cache bump', async () => {
      const { service, steps, orders, logger } = setup(orderIn('NEW'));

      await service.markPaid(ORDER_ID, 'mock_order-1');

      expect(steps).toEqual([
        'begin',
        'read',
        'update NEW → PROCESSING',
        'read',
        'commit',
        'log order.status_changed',
      ]);
      expect(orders.changeStatus).toHaveBeenCalledWith(
        ORDER_ID,
        'NEW',
        { status: 'PROCESSING', paymentStatus: 'PAID', paymentRef: 'mock_order-1' },
        expect.anything(),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'NEW', to: 'PROCESSING', actor: 'system', actorId: null }),
        expect.any(String),
      );
    });

    it.each(['PROCESSING', 'SHIPPED', 'CANCELLED'] as const)(
      'refuses to mark a %s order paid, writing nothing',
      async (status) => {
        const { service, steps } = setup(orderIn(status));

        await expect(service.markPaid(ORDER_ID, 'mock_order-1')).rejects.toMatchObject({
          code: 'INVALID_ORDER_TRANSITION',
          details: { currentStatus: status, requestedStatus: 'PROCESSING' },
        });
        expect(steps).toEqual(['begin', 'read']);
      },
    );

    it('cancels a declined NEW order: payment FAILED, reason PAYMENT_FAILED, stock back, cache bumped', async () => {
      const { service, steps, orders } = setup(orderIn('NEW'));

      await service.cancelDeclined(ORDER_ID);

      expect(steps).toEqual([
        'begin',
        'read',
        'update NEW → CANCELLED',
        'restock',
        'read',
        'commit',
        'invalidate cache',
        'log order.status_changed',
        'log order.cancelled',
      ]);
      expect(orders.changeStatus).toHaveBeenCalledWith(
        ORDER_ID,
        'NEW',
        { status: 'CANCELLED', paymentStatus: 'FAILED', cancelReason: 'PAYMENT_FAILED' },
        expect.anything(),
      );
    });

    it('refuses to cancel a declined order that was cancelled meanwhile, without a second restock', async () => {
      const { service, inventory } = setup(orderIn('CANCELLED', 'VOIDED'));

      await expect(service.cancelDeclined(ORDER_ID)).rejects.toMatchObject({
        code: 'INVALID_ORDER_TRANSITION',
      });
      expect(inventory.restock).not.toHaveBeenCalled();
    });

    it('refunds an order cancelled while its charge was in flight, and logs it once', async () => {
      const { service, orders, logger } = setup(orderIn('CANCELLED', 'VOIDED'));

      await expect(service.refundCancelled(ORDER_ID, 'mock_order-1')).resolves.toBe(true);

      expect(orders.markRefunded).toHaveBeenCalledWith(ORDER_ID, 'mock_order-1');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'order.refunded', orderId: ORDER_ID }),
        expect.any(String),
      );
    });

    it('does not log a refund that did not happen', async () => {
      const { service, orders, logger } = setup(orderIn('CANCELLED', 'REFUNDED'));
      orders.markRefunded.mockResolvedValue(false);

      await expect(service.refundCancelled(ORDER_ID, 'mock_order-1')).resolves.toBe(false);

      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
