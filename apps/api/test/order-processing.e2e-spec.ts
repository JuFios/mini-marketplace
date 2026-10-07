import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { OrderStatus, PaymentStatus, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import type { AuthResponse } from '../src/modules/auth/dto/auth.response.dto';
import type { OrderResponse } from '../src/modules/orders/dto/order.response.dto';
import { ORDER_EVENTS_PUBLISHER } from '../src/modules/orders/order-events.publisher';
import {
  OrderProcessingService,
  ProcessingOutcome,
} from '../src/modules/orders/order-processing.service';
import {
  ORDERS_QUEUE,
  PROCESS_ORDER_JOB,
  STALE_AFTER_MS,
  SWEEP_SCHEDULER_ID,
} from '../src/modules/orders/queue/order-queue.constants';
import { StaleOrderSweeper } from '../src/modules/orders/queue/stale-order.sweeper';
import { MockPaymentProvider } from '../src/modules/payments/mock-payment-provider';
import {
  ChargeRequest,
  ChargeResult,
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../src/modules/payments/payment-provider';
import { createUserWithToken, PASSWORD, register, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';
import { expectStockInvariant } from './helpers/stock-invariant';
import { waitFor } from './helpers/wait-for';

const ADDRESS = '221B Baker Street, London NW1 6XE';

/** The provider as the tests see it: how often it was charged, and optionally held back. */
class ScriptedProvider implements PaymentProvider {
  readonly charged: string[] = [];
  /** Called with the attempt number (1-based); may throw, or return a verdict to override. */
  script: (attempt: number) => Promise<ChargeResult | undefined> = () => Promise.resolve(undefined);

  async charge({ orderId }: ChargeRequest): Promise<ChargeResult> {
    this.charged.push(orderId);
    const scripted = await this.script(this.charged.length);
    return scripted ?? { status: 'approved', reference: `mock_${orderId}` };
  }
}

const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe('order processing (e2e)', () => {
  let app: INestApplication;
  /** An app without a worker, used only to clean up before each worker boots (see `startApp`). */
  let cleaner: INestApplication;
  let prisma: PrismaService;
  let ann: TestUser;
  let admin: TestUser;
  let categoryId: string;

  const api = () => request(httpServer(app));
  const as = (user: TestUser) => ({ Authorization: user.bearer });

  const product = (name: string, price: string, stock: number) =>
    prisma.product.create({ data: { name, description: '', price, stock, categoryId } });
  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
  const orderRow = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const untilStatus = (id: string, status: OrderStatus, timeoutMs?: number) =>
    waitFor(
      () => orderRow(id),
      (order) => order.status === status,
      { timeoutMs },
    );

  async function placeOrder(
    user: TestUser,
    lines: { productId: string; quantity: number }[],
  ): Promise<OrderResponse> {
    await prisma.cartItem.createMany({ data: lines.map((l) => ({ userId: user.id, ...l })) });
    const response = await api()
      .post('/api/v1/orders')
      .set(as(user))
      .set('Idempotency-Key', `key-${randomUUID()}`)
      .send({ shippingAddress: ADDRESS })
      .expect(201);
    return response.body as OrderResponse;
  }

  /**
   * Cleans the database and Redis, boots an app with the worker running in-process and the given
   * payment provider, and adds the users and category every test starts from. The cleaning comes
   * before the boot: the worker acts at once (its stale-order sweep runs as soon as it starts), so
   * leftovers of an earlier test or test file would hand it jobs, and a cleanup afterwards would
   * delete the Redis keys of a job it is still running.
   */
  const startApp = async (
    provider: PaymentProvider,
    overrides: { events?: { orderCreated: () => Promise<void> } } = {},
  ) => {
    await resetDb(cleaner);
    app = await createTestApp(
      (builder) => {
        const configured = builder.overrideProvider(PAYMENT_PROVIDER).useValue(provider);
        return overrides.events
          ? configured.overrideProvider(ORDER_EVENTS_PUBLISHER).useValue(overrides.events)
          : configured;
      },
      [],
      { worker: true },
    );
    // The scheduled sweep runs once at boot, on the clean database. Tests that need the sweeper
    // run it themselves, so no later scheduled run may interleave with theirs.
    await app.get<Queue>(getQueueToken(ORDERS_QUEUE)).removeJobScheduler(SWEEP_SCHEDULER_ID);
    prisma = app.get(PrismaService);
    ann = await createUserWithToken(app, Role.CUSTOMER, 'ann@example.com');
    admin = await createUserWithToken(app, Role.ADMIN);
    categoryId = (await prisma.category.create({ data: { name: 'Peripherals' } })).id;
  };

  beforeAll(async () => {
    cleaner = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await cleaner.close();
  });

  describe('with the mock provider approving everything', () => {
    beforeEach(async () => {
      await startApp(new MockPaymentProvider({ failureRate: 0, delayMs: 0 }));
    });

    it('log in → add to cart → check out → the worker pays the order: PROCESSING / PAID, stock reduced, cart empty', async () => {
      await register(app, 'carol@example.com');
      const login = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'carol@example.com', password: PASSWORD })
        .expect(200);
      const carol = { Authorization: `Bearer ${(login.body as AuthResponse).accessToken}` };
      const keyboard = await product('Mechanical keyboard', '49.90', 10);
      await api()
        .post('/api/v1/cart/items')
        .set(carol)
        .send({ productId: keyboard.id, quantity: 2 })
        .expect(200);

      const placed = await api()
        .post('/api/v1/orders')
        .set(carol)
        .set('Idempotency-Key', 'processing-flow-001')
        .send({ shippingAddress: ADDRESS })
        .expect(201);
      const order = placed.body as OrderResponse;
      // The response is the order as committed; payment happens afterwards, asynchronously.
      expect(order).toMatchObject({ status: 'NEW', paymentStatus: 'PENDING' });

      const paid = await untilStatus(order.id, 'PROCESSING');
      expect(paid).toMatchObject({ paymentStatus: 'PAID', paymentRef: `mock_${order.id}` });

      // What the customer sees, and what they can still do.
      const seen = (await api().get(`/api/v1/orders/${order.id}`).set(carol).expect(200))
        .body as OrderResponse;
      expect(seen).toMatchObject({
        status: 'PROCESSING',
        paymentStatus: 'PAID',
        cancelReason: null,
        allowedTransitions: ['CANCELLED'],
      });
      expect(seen).not.toHaveProperty('paymentRef');
      expect(await stockOf(keyboard.id)).toBe(8);
      expect((await api().get('/api/v1/cart').set(carol).expect(200)).body).toMatchObject({
        items: [],
      });
      await expectStockInvariant(prisma, { [keyboard.id]: 10 });
    });

    it('queues each order under its own id, so one order is never queued twice', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 1 }]);
      await untilStatus(placed.id, 'PROCESSING');

      const queue = app.get<Queue>(getQueueToken(ORDERS_QUEUE));
      const job = await queue.getJob(placed.id);

      expect(job).toMatchObject({
        id: placed.id,
        name: PROCESS_ORDER_JOB,
        data: { orderId: placed.id },
      });
      expect(job?.opts).toMatchObject({
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      });
      // A second add under the same id is ignored, whatever state the first job is in.
      await queue.add(PROCESS_ORDER_JOB, { orderId: placed.id }, { jobId: placed.id });
      expect(await queue.getJobCountByTypes('waiting', 'active', 'delayed')).toBe(0);
    });

    it('processes several orders, one payment each, none of them twice', async () => {
      const mouse = await product('Mouse', '19.99', 20);
      const buyers = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          createUserWithToken(app, Role.CUSTOMER, `buyer${i}@example.com`),
        ),
      );

      const orders = await Promise.all(
        buyers.map((buyer) => placeOrder(buyer, [{ productId: mouse.id, quantity: 1 }])),
      );

      for (const order of orders) await untilStatus(order.id, 'PROCESSING');
      expect(await stockOf(mouse.id)).toBe(14);
      await expectStockInvariant(prisma, { [mouse.id]: 20 });
    });

    it('processing an order that was already processed changes nothing', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 2 }]);
      const before = await untilStatus(placed.id, 'PROCESSING');
      const processing = app.get(OrderProcessingService);

      const outcomes = await Promise.all([
        processing.process(placed.id),
        processing.process(placed.id),
      ]);

      expect(outcomes).toEqual(['skipped', 'skipped']);
      expect(await orderRow(placed.id)).toEqual(before);
      expect(await stockOf(mouse.id)).toBe(8);
    });

    it('an administrator can ship the paid order from there', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 1 }]);
      await untilStatus(placed.id, 'PROCESSING');

      await api()
        .patch(`/api/v1/admin/orders/${placed.id}/status`)
        .set(as(admin))
        .send({ status: 'SHIPPED' })
        .expect(200);

      expect((await orderRow(placed.id)).status).toBe('SHIPPED');
    });
  });

  describe('when the payment is declined', () => {
    beforeEach(async () => {
      await startApp(new MockPaymentProvider({ failureRate: 1, delayMs: 0 }));
    });

    it('cancels the order, marks the payment FAILED and puts the stock back', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);

      const cancelled = await untilStatus(placed.id, 'CANCELLED');

      expect(cancelled).toMatchObject({
        paymentStatus: 'FAILED',
        cancelReason: 'PAYMENT_FAILED',
        paymentRef: null,
      });
      expect(await stockOf(mouse.id)).toBe(10);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
      const seen = (await api().get(`/api/v1/orders/${placed.id}`).set(as(ann)).expect(200))
        .body as OrderResponse;
      expect(seen).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'PAYMENT_FAILED',
        allowedTransitions: [],
      });
    });

    it('is not retried: the product is back in the public catalog exactly once', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
      await waitFor(
        () => stockOf(mouse.id),
        (stock) => stock === 10,
      );

      // Nothing is left to retry: no waiting, running or delayed job, and the stock stays put.
      const queue = app.get<Queue>(getQueueToken(ORDERS_QUEUE));
      await waitFor(
        () => queue.getJobCountByTypes('waiting', 'active', 'delayed'),
        (count) => count === 0,
      );
      expect(await stockOf(mouse.id)).toBe(10);
      expect(await queue.getJobCountByTypes('failed')).toBe(0);
    });

    it('processing the same declined order many times at once restocks it once', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
      await untilStatus(placed.id, 'CANCELLED');
      const processing = app.get(OrderProcessingService);

      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () => processing.process(placed.id)),
      );

      expect(outcomes).toEqual(Array.from({ length: 5 }, () => 'skipped'));
      expect(await stockOf(mouse.id)).toBe(10);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
    });
  });

  describe('duplicate runs on a NEW order', () => {
    let provider: ScriptedProvider;

    beforeEach(async () => {
      provider = new ScriptedProvider();
      // Nothing is handed to the queue, so only the runs the test starts can touch the order.
      await startApp(provider, { events: { orderCreated: () => Promise.resolve() } });
    });

    it('five concurrent runs pay it once: one "paid", the rest see it moved on', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 2 }]);
      const processing = app.get(OrderProcessingService);

      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () => processing.process(placed.id)),
      );

      expect(count(outcomes, 'paid')).toBe(1);
      expect(count(outcomes, 'skipped')).toBe(4);
      expect(await orderRow(placed.id)).toMatchObject({
        status: 'PROCESSING',
        paymentStatus: 'PAID',
        paymentRef: `mock_${placed.id}`,
      });
      expect(await stockOf(mouse.id)).toBe(8);
    });

    it('five concurrent runs of a declined order cancel it once and restock once', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 2 }]);
      provider.script = () => Promise.resolve({ status: 'declined', reason: 'CARD_DECLINED' });
      const processing = app.get(OrderProcessingService);

      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () => processing.process(placed.id)),
      );

      expect(count(outcomes, 'declined')).toBe(1);
      expect(count(outcomes, 'skipped')).toBe(4);
      expect(await orderRow(placed.id)).toMatchObject({
        status: 'CANCELLED',
        paymentStatus: 'FAILED',
      });
      expect(await stockOf(mouse.id)).toBe(10);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
    });
  });

  describe('when the customer cancels while the charge is in flight', () => {
    let provider: ScriptedProvider;

    beforeEach(async () => {
      provider = new ScriptedProvider();
      await startApp(provider);
    });

    it('the charge that goes through is refunded: CANCELLED / REFUNDED, stock restored once', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const charging = deferred();
      const started = deferred();
      provider.script = async () => {
        started.release();
        await charging.promise;
        return undefined;
      };
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
      await started.promise;

      // The worker is mid-charge: the order is still NEW, so the customer may cancel it.
      const cancelled = await api()
        .post(`/api/v1/orders/${placed.id}/cancel`)
        .set(as(ann))
        .expect(200);
      expect(cancelled.body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'VOIDED' });
      expect(await stockOf(mouse.id)).toBe(10);

      charging.release();
      const refunded = await waitFor(
        () => orderRow(placed.id),
        (order) => order.paymentStatus === PaymentStatus.REFUNDED,
      );

      expect(refunded).toMatchObject({
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        cancelReason: 'CUSTOMER_REQUEST',
        paymentRef: `mock_${placed.id}`,
      });
      expect(await stockOf(mouse.id)).toBe(10);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
    });

    it('a declined charge for an order cancelled meanwhile changes nothing more', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const charging = deferred();
      const started = deferred();
      provider.script = async () => {
        started.release();
        await charging.promise;
        return { status: 'declined', reason: 'CARD_DECLINED' };
      };
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
      await started.promise;
      await api().post(`/api/v1/orders/${placed.id}/cancel`).set(as(ann)).expect(200);

      charging.release();
      const queue = app.get<Queue>(getQueueToken(ORDERS_QUEUE));
      await waitFor(
        () => queue.getJobCountByTypes('active', 'waiting', 'delayed'),
        (jobs) => jobs === 0,
      );

      expect(await orderRow(placed.id)).toMatchObject({
        status: 'CANCELLED',
        paymentStatus: 'VOIDED',
        cancelReason: 'CUSTOMER_REQUEST',
      });
      expect(await stockOf(mouse.id)).toBe(10);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
    });
  });

  describe('when the payment provider cannot be reached', () => {
    it('retries the job with backoff until it goes through, and the order is paid once', async () => {
      const provider = new ScriptedProvider();
      provider.script = (attempt) =>
        attempt === 1 ? Promise.reject(new Error('gateway timeout')) : Promise.resolve(undefined);
      await startApp(provider);
      const mouse = await product('Mouse', '19.99', 10);

      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 2 }]);

      // The first attempt fails; after about one second of backoff the second succeeds.
      const paid = await untilStatus(placed.id, 'PROCESSING', 12_000);
      expect(paid.paymentStatus).toBe('PAID');
      expect(provider.charged).toEqual([placed.id, placed.id]);
      expect(await stockOf(mouse.id)).toBe(8);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
    });
  });

  describe('when the hand-over to the queue was lost', () => {
    let provider: ScriptedProvider;
    const lostHandOver = { orderCreated: () => Promise.reject(new Error('Redis is down')) };

    beforeEach(async () => {
      provider = new ScriptedProvider();
      await startApp(provider, { events: lostHandOver });
    });

    it('checkout still answers 201, and the sweeper later queues the order, which is then paid', async () => {
      const mouse = await product('Mouse', '19.99', 10);

      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 2 }]);

      // The order exists and is NEW, with no job: nothing will ever pay it by itself.
      const queue = app.get<Queue>(getQueueToken(ORDERS_QUEUE));
      expect(await queue.getJob(placed.id)).toBeUndefined();
      expect(await stockOf(mouse.id)).toBe(8);

      // Recent orders are not the sweeper's business: they may simply be waiting their turn.
      const sweeper = app.get(StaleOrderSweeper);
      expect(await sweeper.sweep()).toEqual({ enqueued: 0, retried: 0, replaced: 0, skipped: 0 });
      expect((await orderRow(placed.id)).status).toBe('NEW');

      // Once it is old enough, the sweep queues it and the worker pays it.
      await prisma.order.update({
        where: { id: placed.id },
        data: { createdAt: new Date(Date.now() - STALE_AFTER_MS - 1_000) },
      });
      expect(await sweeper.sweep()).toEqual({ enqueued: 1, retried: 0, replaced: 0, skipped: 0 });
      const paid = await untilStatus(placed.id, 'PROCESSING');

      expect(paid.paymentStatus).toBe('PAID');
      expect(provider.charged).toEqual([placed.id]);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
    });

    it('does not touch an order that has a live job or is no longer NEW', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const queue = app.get<Queue>(getQueueToken(ORDERS_QUEUE));
      const old = new Date(Date.now() - STALE_AFTER_MS - 1_000);
      const delayed = await placeOrder(ann, [{ productId: mouse.id, quantity: 1 }]);
      const other = await createUserWithToken(app, Role.CUSTOMER, 'bob@example.com');
      const processed = await placeOrder(other, [{ productId: mouse.id, quantity: 1 }]);
      await prisma.order.updateMany({
        where: { id: { in: [delayed.id, processed.id] } },
        data: { createdAt: old },
      });
      await prisma.order.update({ where: { id: processed.id }, data: { status: 'PROCESSING' } });
      // A job that is waiting for its time: the sweeper must leave it be.
      await queue.add(
        PROCESS_ORDER_JOB,
        { orderId: delayed.id },
        { jobId: delayed.id, delay: 60_000 },
      );

      const result = await app.get(StaleOrderSweeper).sweep();

      expect(result).toEqual({ enqueued: 0, retried: 0, replaced: 0, skipped: 1 });
      expect((await orderRow(delayed.id)).status).toBe('NEW');
      expect(provider.charged).toEqual([]);
    });
  });
});

const count = (outcomes: ProcessingOutcome[], outcome: ProcessingOutcome): number =>
  outcomes.filter((o) => o === outcome).length;
