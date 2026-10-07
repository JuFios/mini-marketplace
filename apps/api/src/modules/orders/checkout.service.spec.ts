import type { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { CartService } from '../cart/cart.service';
import type { CatalogCacheService } from '../catalog-cache/catalog-cache.service';
import { CheckoutService } from './checkout.service';
import type { DecrementedProduct, InventoryRepository, StockLine } from './inventory.repository';
import type { OrderWithItems } from './mappers/to-order-response';
import type { NewOrder, OrdersRepository } from './orders.repository';

const USER = 'user-1';
const KEY = 'checkout-key-1';
const ADDRESS = '1 Main Street, Springfield';
const REQUEST = { userId: USER, idempotencyKey: KEY, shippingAddress: ADDRESS };

// Product ids whose string order is the lock order.
const A = '0000000a-0000-4000-8000-000000000000';
const B = '0000000b-0000-4000-8000-000000000000';
const C = '0000000c-0000-4000-8000-000000000000';

const PRODUCTS: Record<string, { name: string; price: string }> = {
  [A]: { name: 'Alpha', price: '10.10' },
  [B]: { name: 'Bravo', price: '0.20' },
  [C]: { name: 'Charlie', price: '3.00' },
};

function storedOrder(order: NewOrder, id = 'order-1'): OrderWithItems {
  const at = new Date('2026-10-06T12:00:00.000Z');
  return {
    id,
    userId: order.userId,
    status: 'NEW',
    paymentStatus: 'PENDING',
    paymentRef: null,
    totalAmount: order.totalAmount,
    shippingAddress: order.shippingAddress,
    idempotencyKey: order.idempotencyKey,
    cancelReason: null,
    createdAt: at,
    updatedAt: at,
    items: order.items.map((item, index) => ({ id: `item-${index}`, orderId: id, ...item })),
  };
}

const EXISTING = storedOrder(
  {
    userId: USER,
    idempotencyKey: KEY,
    shippingAddress: ADDRESS,
    totalAmount: new Prisma.Decimal('3.00'),
    items: [
      { productId: C, productName: 'Charlie', unitPrice: new Prisma.Decimal('3.00'), quantity: 1 },
    ],
  },
  'existing-order',
);

function uniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

/**
 * Wires the service to mocks that record, in order, every step they see. `$transaction` runs the
 * callback with an opaque client and records "commit" only when the callback succeeded: a step
 * recorded after "commit" really ran after the transaction.
 */
function setup(cartLines: StockLine[]) {
  const steps: string[] = [];
  const tx = { opaque: 'transaction client' };

  const prisma = {
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => {
      steps.push('begin');
      const result = await run(tx);
      steps.push('commit');
      return result;
    }),
  };
  const cart = {
    lockItemsForCheckout: jest.fn(() => {
      steps.push('lock cart');
      return Promise.resolve(cartLines);
    }),
    removePurchased: jest.fn((_user: string, productIds: string[]) => {
      steps.push(`remove ${productIds.map((id) => PRODUCTS[id].name).join(',')}`);
      return Promise.resolve();
    }),
  };
  const inventory = {
    decrementStock: jest.fn((productId: string): Promise<DecrementedProduct | null> => {
      steps.push(`decrement ${PRODUCTS[productId].name}`);
      const { name, price } = PRODUCTS[productId];
      return Promise.resolve({ id: productId, name, price: new Prisma.Decimal(price) });
    }),
    findStockState: jest.fn(),
  };
  const orders = {
    findByIdempotencyKey: jest.fn((_user: string, _key: string, client?: unknown) => {
      steps.push(client === tx ? 're-check key' : 'pre-check key');
      return Promise.resolve<OrderWithItems | null>(null);
    }),
    create: jest.fn((order: NewOrder, _client: unknown) => {
      steps.push('insert order');
      return Promise.resolve(storedOrder(order));
    }),
  };
  const catalogCache = {
    invalidate: jest.fn(() => {
      steps.push('invalidate cache');
      return Promise.resolve();
    }),
  };
  const orderEvents = {
    orderCreated: jest.fn(() => {
      steps.push('publish');
      return Promise.resolve();
    }),
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn((fields: { event?: string }) => {
      if (fields.event) steps.push(`log ${fields.event}`);
    }),
    warn: jest.fn(),
  };

  const service = new CheckoutService(
    prisma as unknown as PrismaService,
    cart as unknown as CartService,
    inventory as unknown as InventoryRepository,
    orders as unknown as OrdersRepository,
    catalogCache as unknown as CatalogCacheService,
    orderEvents,
    logger as unknown as PinoLogger,
  );
  return { service, steps, tx, prisma, cart, inventory, orders, catalogCache, orderEvents, logger };
}

const line = (productId: string, quantity: number): StockLine => ({ productId, quantity });

describe('CheckoutService', () => {
  describe('a successful checkout', () => {
    it('locks the cart, re-checks the key, takes stock, writes the order, clears the cart, then commits before any side effect', async () => {
      const { service, steps } = setup([line(A, 1), line(B, 2)]);

      await service.placeOrder(REQUEST);

      expect(steps).toEqual([
        'pre-check key',
        'begin',
        'lock cart',
        're-check key',
        'decrement Alpha',
        'decrement Bravo',
        'insert order',
        'remove Alpha,Bravo',
        'commit',
        'invalidate cache',
        'publish',
        'log order.created',
      ]);
    });

    it('decrements in ascending product id order even when the cart rows arrive unsorted', async () => {
      const { service, inventory } = setup([line(C, 1), line(A, 1), line(B, 1)]);

      await service.placeOrder(REQUEST);

      expect(inventory.decrementStock.mock.calls.map(([productId]) => productId)).toEqual([
        A,
        B,
        C,
      ]);
    });

    it('prices the order from the locked rows and totals it exactly: 2 × 10.10 + 3 × 0.20 = 20.80', async () => {
      const { service, orders, tx } = setup([line(B, 3), line(A, 2)]);

      const { order, replayed } = await service.placeOrder(REQUEST);

      const written = orders.create.mock.calls[0][0];
      expect(written.totalAmount.toFixed(2)).toBe('20.80');
      expect(written).toMatchObject({
        userId: USER,
        idempotencyKey: KEY,
        shippingAddress: ADDRESS,
      });
      expect(
        written.items.map((item) => ({ ...item, unitPrice: item.unitPrice.toFixed(2) })),
      ).toEqual([
        { productId: A, productName: 'Alpha', unitPrice: '10.10', quantity: 2 },
        { productId: B, productName: 'Bravo', unitPrice: '0.20', quantity: 3 },
      ]);
      expect(orders.create.mock.calls[0][1]).toBe(tx);
      expect(replayed).toBe(false);
      expect(order).toMatchObject({ id: 'order-1', status: 'NEW', totalAmount: '20.80' });
    });

    it('removes exactly the locked lines, inside the transaction', async () => {
      const { service, cart, tx } = setup([line(B, 1), line(A, 1)]);

      await service.placeOrder(REQUEST);

      expect(cart.removePurchased).toHaveBeenCalledWith(USER, [A, B], tx);
    });

    it('runs the transaction at READ COMMITTED', async () => {
      const { service, prisma } = setup([line(A, 1)]);

      await service.placeOrder(REQUEST);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });
    });

    it('logs order.created with the order facts and no address', async () => {
      const { service, logger } = setup([line(A, 2)]);

      await service.placeOrder(REQUEST);

      expect(logger.info).toHaveBeenCalledWith(
        {
          event: 'order.created',
          orderId: 'order-1',
          userId: USER,
          totalAmount: '20.20',
          itemsCount: 1,
        },
        expect.any(String),
      );
    });

    it('still succeeds when handing the committed order over fails', async () => {
      const { service, orderEvents, logger, steps } = setup([line(A, 1)]);
      orderEvents.orderCreated.mockRejectedValueOnce(new Error('queue unavailable'));

      await expect(service.placeOrder(REQUEST)).resolves.toMatchObject({ replayed: false });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1' }),
        expect.any(String),
      );
      expect(steps).toContain('log order.created');
    });
  });

  describe('refusals', () => {
    it('refuses an empty cart with 409 CART_EMPTY and writes nothing', async () => {
      const { service, inventory, orders, cart, steps } = setup([]);

      await expect(service.placeOrder(REQUEST)).rejects.toMatchObject({
        httpStatus: 409,
        code: 'CART_EMPTY',
      });
      expect(inventory.decrementStock).not.toHaveBeenCalled();
      expect(orders.create).not.toHaveBeenCalled();
      expect(cart.removePurchased).not.toHaveBeenCalled();
      expect(steps).not.toContain('commit');
    });

    it('stops at the first line without enough stock: 409 INSUFFICIENT_STOCK with the numbers, nothing else written, no side effects', async () => {
      const { service, inventory, orders, cart, catalogCache, orderEvents, logger, steps } = setup([
        line(A, 1),
        line(B, 4),
        line(C, 1),
      ]);
      inventory.decrementStock.mockImplementation((productId: string) => {
        steps.push(`decrement ${PRODUCTS[productId].name}`);
        if (productId === B) return Promise.resolve(null);
        const { name, price } = PRODUCTS[productId];
        return Promise.resolve({ id: productId, name, price: new Prisma.Decimal(price) });
      });
      inventory.findStockState.mockResolvedValue({ name: 'Bravo', stock: 3, deletedAt: null });

      await expect(service.placeOrder(REQUEST)).rejects.toMatchObject({
        httpStatus: 409,
        code: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for "Bravo"',
        details: [{ productId: B, requested: 4, available: 3 }],
      });

      // Alpha was decremented inside the same transaction; its rollback is the database's job.
      expect(steps).toEqual([
        'pre-check key',
        'begin',
        'lock cart',
        're-check key',
        'decrement Alpha',
        'decrement Bravo',
        'log checkout.insufficient_stock',
      ]);
      expect(orders.create).not.toHaveBeenCalled();
      expect(cart.removePurchased).not.toHaveBeenCalled();
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
      expect(orderEvents.orderCreated).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'order.created' }),
        expect.anything(),
      );
    });

    it('reports an archived product as 409 PRODUCT_UNAVAILABLE, naming it', async () => {
      const { service, inventory, orders } = setup([line(A, 1)]);
      inventory.decrementStock.mockResolvedValue(null);
      inventory.findStockState.mockResolvedValue({
        name: 'Alpha',
        stock: 10,
        deletedAt: new Date(),
      });

      await expect(service.placeOrder(REQUEST)).rejects.toMatchObject({
        httpStatus: 409,
        code: 'PRODUCT_UNAVAILABLE',
        message: '"Alpha" is no longer available',
        details: [{ productId: A }],
      });
      expect(orders.create).not.toHaveBeenCalled();
    });

    it('passes unexpected errors through untouched, without side effects', async () => {
      const { service, inventory, catalogCache } = setup([line(A, 1)]);
      const failure = new Error('connection reset');
      inventory.decrementStock.mockRejectedValue(failure);

      await expect(service.placeOrder(REQUEST)).rejects.toBe(failure);
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('answers a retry from the pre-check, without a transaction', async () => {
      const { service, orders, prisma, catalogCache } = setup([line(A, 1)]);
      orders.findByIdempotencyKey.mockResolvedValueOnce(EXISTING);

      const result = await service.placeOrder(REQUEST);

      expect(result).toMatchObject({ replayed: true, order: { id: 'existing-order' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
    });

    it('replays an order committed by a same-key request while this one waited for the cart lock', async () => {
      const { service, orders, inventory, orderEvents, tx } = setup([]);
      orders.findByIdempotencyKey.mockImplementation((_u: string, _k: string, client?: unknown) =>
        Promise.resolve(client === tx ? EXISTING : null),
      );

      const result = await service.placeOrder(REQUEST);

      // The cart is empty because that order emptied it: a replay, not CART_EMPTY.
      expect(result).toMatchObject({ replayed: true, order: { id: 'existing-order' } });
      expect(inventory.decrementStock).not.toHaveBeenCalled();
      expect(orderEvents.orderCreated).not.toHaveBeenCalled();
    });

    it('falls back to the winning order when the insert hits the unique key', async () => {
      const { service, orders, catalogCache, orderEvents } = setup([line(A, 1)]);
      orders.create.mockRejectedValue(uniqueViolation());
      orders.findByIdempotencyKey
        .mockResolvedValueOnce(null) // pre-check
        .mockResolvedValueOnce(null) // re-check inside the transaction
        .mockResolvedValueOnce(EXISTING); // after the rollback

      const result = await service.placeOrder(REQUEST);

      expect(result).toMatchObject({ replayed: true, order: { id: 'existing-order' } });
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
      expect(orderEvents.orderCreated).not.toHaveBeenCalled();
    });

    it('rethrows a unique violation when no order with the key exists after all', async () => {
      const { service, orders } = setup([line(A, 1)]);
      const violation = uniqueViolation();
      orders.create.mockRejectedValue(violation);

      await expect(service.placeOrder(REQUEST)).rejects.toBe(violation);
    });

    describe('a key reused with another shipping address', () => {
      const ELSEWHERE = { ...REQUEST, shippingAddress: '9 Other Road, Shelbyville' };
      const REUSED = { code: 'IDEMPOTENCY_KEY_REUSED', httpStatus: 422 };

      it('is refused by the pre-check instead of answering with the order of the first request', async () => {
        const { service, orders, prisma } = setup([line(A, 1)]);
        orders.findByIdempotencyKey.mockResolvedValueOnce(EXISTING);

        await expect(service.placeOrder(ELSEWHERE)).rejects.toMatchObject(REUSED);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('is refused when the first request committed while this one waited for the cart lock', async () => {
        const { service, orders, inventory, tx } = setup([]);
        orders.findByIdempotencyKey.mockImplementation((_u: string, _k: string, client?: unknown) =>
          Promise.resolve(client === tx ? EXISTING : null),
        );

        await expect(service.placeOrder(ELSEWHERE)).rejects.toMatchObject(REUSED);
        expect(inventory.decrementStock).not.toHaveBeenCalled();
      });

      it('is refused when the insert loses the race for the key', async () => {
        const { service, orders, catalogCache, orderEvents } = setup([line(A, 1)]);
        orders.create.mockRejectedValue(uniqueViolation());
        orders.findByIdempotencyKey
          .mockResolvedValueOnce(null) // pre-check
          .mockResolvedValueOnce(null) // re-check inside the transaction
          .mockResolvedValueOnce(EXISTING); // after the rollback

        await expect(service.placeOrder(ELSEWHERE)).rejects.toMatchObject(REUSED);
        expect(catalogCache.invalidate).not.toHaveBeenCalled();
        expect(orderEvents.orderCreated).not.toHaveBeenCalled();
      });
    });
  });
});
