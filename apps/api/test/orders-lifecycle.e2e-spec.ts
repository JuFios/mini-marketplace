import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Paginated } from '../src/common/pagination/pagination.dto';
import { OrderStatus, PaymentStatus, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import type {
  AdminOrderResponse,
  AdminOrderSummaryResponse,
  OrderResponse,
  OrderSummaryResponse,
} from '../src/modules/orders/dto/order.response.dto';
import type { ProductResponse } from '../src/modules/products/dto/product.response.dto';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';
import { expectStockInvariant } from './helpers/stock-invariant';

const ADDRESS = '221B Baker Street, London NW1 6XE';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
// Fixed ids make the lock order (ascending product id) known: FIRST sorts before SECOND.
const FIRST_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_ID = '00000000-0000-4000-8000-000000000002';

const STATUSES = Object.values(OrderStatus);
const PAID = { paymentStatus: PaymentStatus.PAID, paymentRef: 'mock_payment' };

interface OrderSpec {
  user: TestUser;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  createdAt?: Date;
  quantity?: number;
}

describe('order lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ann: TestUser;
  let bob: TestUser;
  let admin: TestUser;
  let categoryId: string;
  /** Stock-neutral product for orders inserted directly; a real checkout never touches it. */
  let widgetId: string;

  const api = () => request(httpServer(app));
  const as = (user: TestUser) => ({ Authorization: user.bearer });

  const product = (name: string, price: string, stock: number, id?: string) =>
    prisma.product.create({ data: { id, name, description: '', price, stock, categoryId } });
  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
  const statusOf = async (id: string) =>
    (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

  /** Writes an order straight into the database, in any status, with a known creation time. */
  async function insertOrder({
    user,
    status = OrderStatus.NEW,
    paymentStatus = PaymentStatus.PENDING,
    createdAt = new Date('2026-10-01T10:00:00.000Z'),
    quantity = 1,
  }: OrderSpec): Promise<string> {
    const widget = await prisma.product.findUniqueOrThrow({ where: { id: widgetId } });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        status,
        paymentStatus,
        totalAmount: widget.price.mul(quantity),
        shippingAddress: ADDRESS,
        idempotencyKey: randomUUID(),
        createdAt,
        updatedAt: createdAt,
        items: {
          create: [
            {
              productId: widgetId,
              productName: widget.name,
              unitPrice: widget.price,
              quantity,
            },
          ],
        },
      },
    });
    return order.id;
  }

  /** A real checkout, so the stock really is taken and a cancellation has something to give back. */
  async function placeOrder(
    user: TestUser,
    lines: { productId: string; quantity: number }[],
  ): Promise<OrderResponse> {
    await prisma.cartItem.createMany({
      data: lines.map((line) => ({ userId: user.id, ...line })),
    });
    const response = await api()
      .post('/api/v1/orders')
      .set(as(user))
      .set('Idempotency-Key', `key-${randomUUID()}`)
      .send({ shippingAddress: ADDRESS })
      .expect(201);
    return response.body as OrderResponse;
  }

  /** What payment processing does to an order once the charge succeeded. */
  const markPaid = (orderId: string) =>
    prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PROCESSING, ...PAID },
    });

  const cancel = (user: TestUser, orderId: string) =>
    api().post(`/api/v1/orders/${orderId}/cancel`).set(as(user));
  const changeStatus = (orderId: string, status: string) =>
    api().patch(`/api/v1/admin/orders/${orderId}/status`).set(as(admin)).send({ status });
  const history = async (user: TestUser, query = '') =>
    (await api().get(`/api/v1/orders${query}`).set(as(user)).expect(200))
      .body as Paginated<OrderSummaryResponse>;
  const adminList = async (query = '') =>
    (await api().get(`/api/v1/admin/orders${query}`).set(as(admin)).expect(200))
      .body as Paginated<AdminOrderSummaryResponse>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await createUserWithToken(app, Role.CUSTOMER, 'ann@example.com');
    bob = await createUserWithToken(app, Role.CUSTOMER, 'bob@example.com');
    admin = await createUserWithToken(app, Role.ADMIN);
    categoryId = (await prisma.category.create({ data: { name: 'Peripherals' } })).id;
    widgetId = (await product('Widget', '10.00', 1000)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('order history', () => {
    it("lists only the caller's orders, newest first, as summaries", async () => {
      const oldest = await insertOrder({ user: ann, createdAt: new Date('2026-10-01T08:00:00Z') });
      const newest = await insertOrder({
        user: ann,
        status: 'PROCESSING',
        paymentStatus: 'PAID',
        quantity: 3,
        createdAt: new Date('2026-10-03T08:00:00Z'),
      });
      const middle = await insertOrder({ user: ann, createdAt: new Date('2026-10-02T08:00:00Z') });
      await insertOrder({ user: bob, createdAt: new Date('2026-10-02T12:00:00Z') });

      const page = await history(ann);

      expect(page.items.map((o) => o.id)).toEqual([newest, middle, oldest]);
      expect(page.items[0]).toEqual({
        id: newest,
        status: 'PROCESSING',
        paymentStatus: 'PAID',
        totalAmount: '30.00',
        itemsCount: 1,
        createdAt: '2026-10-03T08:00:00.000Z',
      });
      expect(page.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
      // Bob sees his own order and none of Ann's.
      expect((await history(bob)).items).toHaveLength(1);
    });

    it('counts order lines, not units', async () => {
      const gadget = await product('Gadget', '2.50', 10);
      const placed = await placeOrder(ann, [
        { productId: widgetId, quantity: 4 },
        { productId: gadget.id, quantity: 2 },
      ]);

      expect((await history(ann)).items).toEqual([
        expect.objectContaining({ id: placed.id, totalAmount: '45.00', itemsCount: 2 }),
      ]);
    });

    it('pages through the history, and the order is total even when timestamps are equal', async () => {
      const same = new Date('2026-10-02T08:00:00Z');
      const ids = [
        await insertOrder({ user: ann, createdAt: same }),
        await insertOrder({ user: ann, createdAt: same }),
        await insertOrder({ user: ann, createdAt: same }),
        await insertOrder({ user: ann, createdAt: new Date('2026-10-03T08:00:00Z') }),
        await insertOrder({ user: ann, createdAt: new Date('2026-10-01T08:00:00Z') }),
      ];

      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const result = await history(ann, `?limit=2&page=${page}`);
        expect(result.meta).toEqual({ page, limit: 2, total: 5, totalPages: 3 });
        seen.push(...result.items.map((o) => o.id));
      }

      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...ids].sort());
      // Newest first, then ascending id among equal timestamps.
      expect(seen[0]).toBe(ids[3]);
      expect(seen.slice(1, 4)).toEqual([ids[0], ids[1], ids[2]].sort());
      expect(seen[4]).toBe(ids[4]);
      expect((await history(ann, '?limit=2&page=9')).items).toEqual([]);
    });

    it('filters by status', async () => {
      const cancelled = await insertOrder({
        user: ann,
        status: 'CANCELLED',
        paymentStatus: 'VOIDED',
      });
      await insertOrder({ user: ann, status: 'NEW' });
      await insertOrder({ user: ann, status: 'SHIPPED', paymentStatus: 'PAID' });

      const page = await history(ann, '?status=CANCELLED');

      expect(page.items.map((o) => o.id)).toEqual([cancelled]);
      expect(page.meta.total).toBe(1);
      expect((await history(ann, '?status=COMPLETED')).items).toEqual([]);
    });

    it('has an empty history for a customer who never ordered', async () => {
      expect(await history(ann)).toEqual({
        items: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    it.each([
      ['an unknown status', '?status=DELIVERED'],
      ['a lower-case status', '?status=new'],
      ['a limit above the cap', '?limit=101'],
      ['page zero', '?page=0'],
      ['an administrator-only filter', '?customerEmail=ann'],
      ['an unknown parameter', '?sort=price'],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_name, query) => {
      const response = await api().get(`/api/v1/orders${query}`).set(as(ann)).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('reading one order', () => {
    it('offers the customer only cancellation, and only while the order is NEW or PROCESSING', async () => {
      const offered: Record<string, string[]> = {};
      for (const status of STATUSES) {
        const id = await insertOrder({ user: ann, status });
        const order = (await api().get(`/api/v1/orders/${id}`).set(as(ann)).expect(200))
          .body as OrderResponse;
        offered[status] = order.allowedTransitions;
      }

      expect(offered).toEqual({
        NEW: ['CANCELLED'],
        PROCESSING: ['CANCELLED'],
        SHIPPED: [],
        COMPLETED: [],
        CANCELLED: [],
      });
    });

    it('offers the administrator the forward steps and cancellation', async () => {
      const offered: Record<string, string[]> = {};
      for (const status of STATUSES) {
        const id = await insertOrder({ user: ann, status });
        const order = (await api().get(`/api/v1/admin/orders/${id}`).set(as(admin)).expect(200))
          .body as AdminOrderResponse;
        offered[status] = order.allowedTransitions;
      }

      expect(offered).toEqual({
        NEW: ['CANCELLED'],
        PROCESSING: ['SHIPPED', 'CANCELLED'],
        SHIPPED: ['COMPLETED'],
        COMPLETED: [],
        CANCELLED: [],
      });
    });

    it('accepts exactly the transitions it offers: administrator, every status to every status', async () => {
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          const id = await insertOrder({ user: ann, status: from });
          const detail = (await api().get(`/api/v1/admin/orders/${id}`).set(as(admin)).expect(200))
            .body as AdminOrderResponse;

          const response = await changeStatus(id, to);

          expect([`${from}→${to}`, response.status]).toEqual([
            `${from}→${to}`,
            detail.allowedTransitions.includes(to) ? 200 : 409,
          ]);
        }
      }
    });

    it('accepts exactly the transitions it offers: customer cancelling from every status', async () => {
      for (const from of STATUSES) {
        const id = await insertOrder({ user: ann, status: from });
        const detail = (await api().get(`/api/v1/orders/${id}`).set(as(ann)).expect(200))
          .body as OrderResponse;

        const response = await cancel(ann, id);

        expect([from, response.status]).toEqual([
          from,
          detail.allowedTransitions.includes('CANCELLED') ? 200 : 409,
        ]);
      }
    });

    it("answers 404 ORDER_NOT_FOUND for another customer's order and for an unknown id", async () => {
      const bobsOrder = await insertOrder({ user: bob });

      for (const id of [bobsOrder, MISSING_ID]) {
        const response = await api().get(`/api/v1/orders/${id}`).set(as(ann)).expect(404);
        expect(response.body).toMatchObject({ code: 'ORDER_NOT_FOUND' });
      }
      await api().get('/api/v1/orders/not-a-uuid').set(as(ann)).expect(400);
    });
  });

  describe('a customer cancels', () => {
    it('a NEW order: the stock comes back, the payment is voided, the public catalog shows it at once', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
      // Warms the public cache with the reduced stock: the cancellation must invalidate it.
      expect(
        ((await api().get(`/api/v1/products/${mouse.id}`).expect(200)).body as ProductResponse)
          .stock,
      ).toBe(7);

      const response = await cancel(ann, placed.id).expect(200);

      const order = response.body as OrderResponse;
      expect(order).toMatchObject({
        id: placed.id,
        status: 'CANCELLED',
        paymentStatus: 'VOIDED',
        cancelReason: 'CUSTOMER_REQUEST',
        totalAmount: '59.97',
        allowedTransitions: [],
      });
      expect(order.items).toEqual(placed.items);
      expect(await stockOf(mouse.id)).toBe(10);
      expect(
        ((await api().get(`/api/v1/products/${mouse.id}`).expect(200)).body as ProductResponse)
          .stock,
      ).toBe(10);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
      // The order reads back as it was returned.
      expect(
        (await api().get(`/api/v1/orders/${placed.id}`).set(as(ann)).expect(200)).body,
      ).toEqual(order);
    });

    it('a PROCESSING order: the stock comes back and the payment is refunded', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 4 }]);
      await markPaid(placed.id);

      const response = await cancel(ann, placed.id).expect(200);

      expect(response.body).toMatchObject({
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        cancelReason: 'CUSTOMER_REQUEST',
      });
      expect(await stockOf(mouse.id)).toBe(10);
      await expectStockInvariant(prisma, { [mouse.id]: 10 });
    });

    it('puts back every line, an archived product included', async () => {
      const keyboard = await product('Keyboard', '49.00', 5);
      const cable = await product('Cable', '5.00', 8);
      const placed = await placeOrder(ann, [
        { productId: keyboard.id, quantity: 2 },
        { productId: cable.id, quantity: 8 },
      ]);
      await prisma.product.update({ where: { id: cable.id }, data: { deletedAt: new Date() } });

      await cancel(ann, placed.id).expect(200);

      expect(await stockOf(keyboard.id)).toBe(5);
      expect(await stockOf(cable.id)).toBe(8);
      // Still archived: restocking never brings a product back.
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: cable.id } })).deletedAt,
      ).not.toBeNull();
      await expectStockInvariant(prisma, { [keyboard.id]: 5, [cable.id]: 8 });
    });

    it('gives the units back once: a second cancellation is 409 and the stock stays put', async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);

      await cancel(ann, placed.id).expect(200);
      const again = await cancel(ann, placed.id).expect(409);

      expect(again.body).toMatchObject({
        code: 'INVALID_ORDER_TRANSITION',
        details: { currentStatus: 'CANCELLED', requestedStatus: 'CANCELLED' },
      });
      expect(await stockOf(mouse.id)).toBe(10);
    });

    it('moves the order’s update time forward', async () => {
      const id = await insertOrder({ user: ann });

      const order = (await cancel(ann, id).expect(200)).body as OrderResponse;

      expect(new Date(order.updatedAt).getTime()).toBeGreaterThan(
        new Date('2026-10-01T10:00:00.000Z').getTime(),
      );
      expect(order.createdAt).toBe('2026-10-01T10:00:00.000Z');
    });

    it.each(['SHIPPED', 'COMPLETED'] as const)(
      'refuses a %s order with 409 INVALID_ORDER_TRANSITION and changes nothing',
      async (status) => {
        const mouse = await product('Mouse', '19.99', 10);
        const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
        await prisma.order.update({ where: { id: placed.id }, data: { status, ...PAID } });

        const response = await cancel(ann, placed.id).expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: 'INVALID_ORDER_TRANSITION',
          details: { currentStatus: status, requestedStatus: 'CANCELLED' },
        });
        expect(await statusOf(placed.id)).toBe(status);
        expect(await stockOf(mouse.id)).toBe(7);
      },
    );

    it("answers 404 for another customer's order or an unknown one, and cancels nothing", async () => {
      const mouse = await product('Mouse', '19.99', 10);
      const bobs = await placeOrder(bob, [{ productId: mouse.id, quantity: 3 }]);

      for (const id of [bobs.id, MISSING_ID]) {
        const response = await cancel(ann, id).expect(404);
        expect(response.body).toMatchObject({ code: 'ORDER_NOT_FOUND' });
      }
      await api().post('/api/v1/orders/not-a-uuid/cancel').set(as(ann)).expect(400);
      expect(await statusOf(bobs.id)).toBe('NEW');
      expect(await stockOf(mouse.id)).toBe(7);
    });

    it('is for customers only', async () => {
      const id = await insertOrder({ user: ann });

      await api().post(`/api/v1/orders/${id}/cancel`).set(as(admin)).expect(403);
      await api().post(`/api/v1/orders/${id}/cancel`).expect(401);
      await api().get('/api/v1/orders').set(as(admin)).expect(403);
      expect(await statusOf(id)).toBe('NEW');
    });
  });

  describe('concurrent changes', () => {
    it('parallel double-cancel: one 200, the others 409, the stock restored once', async () => {
      const mouse = await product('Mouse', '19.99', 5);
      const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 2 }]);

      const responses = await Promise.all(Array.from({ length: 6 }, () => cancel(ann, placed.id)));

      expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(5);
      for (const loser of responses.filter((r) => r.status === 409)) {
        expect(loser.body).toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });
      }
      expect(await stockOf(mouse.id)).toBe(5);
      await expectStockInvariant(prisma, { [mouse.id]: 5 });
    });

    it('customer and administrator cancelling together: exactly one wins, the stock is restored once', async () => {
      for (let round = 0; round < 5; round += 1) {
        const mouse = await product(`Mouse ${round}`, '19.99', 5);
        const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 2 }]);
        await markPaid(placed.id);

        const [byCustomer, byAdmin] = await Promise.all([
          cancel(ann, placed.id),
          changeStatus(placed.id, 'CANCELLED'),
        ]);

        expect([byCustomer.status, byAdmin.status].sort()).toEqual([200, 409]);
        const winner = byCustomer.status === 200 ? 'CUSTOMER_REQUEST' : 'ADMIN_ACTION';
        expect(await prisma.order.findUniqueOrThrow({ where: { id: placed.id } })).toMatchObject({
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          cancelReason: winner,
        });
        await expectStockInvariant(prisma, { [mouse.id]: 5 });
      }
    });

    it('a customer cancelling against an administrator shipping: one wins, and the stock matches the winner', async () => {
      for (let round = 0; round < 10; round += 1) {
        const mouse = await product(`Mouse ${round}`, '19.99', 5);
        const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 2 }]);
        await markPaid(placed.id);

        const [cancelled, shipped] = await Promise.all([
          cancel(ann, placed.id),
          changeStatus(placed.id, 'SHIPPED'),
        ]);

        expect([cancelled.status, shipped.status].sort()).toEqual([200, 409]);
        const finalStatus = await statusOf(placed.id);
        expect(finalStatus).toBe(cancelled.status === 200 ? 'CANCELLED' : 'SHIPPED');
        // Cancelled: the units are back. Shipped: they stay sold.
        expect(await stockOf(mouse.id)).toBe(finalStatus === 'CANCELLED' ? 5 : 3);
        await expectStockInvariant(prisma, { [mouse.id]: 5 });
      }
    });

    it('cancellations and checkouts that lock the same products in opposite cart order never deadlock', async () => {
      const first = await product('First', '10.00', 100, FIRST_ID);
      const second = await product('Second', '10.00', 100, SECOND_ID);
      const sellers = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          createUserWithToken(app, Role.CUSTOMER, `seller${i}@example.com`),
        ),
      );
      const buyers = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          createUserWithToken(app, Role.CUSTOMER, `buyer${i}@example.com`),
        ),
      );
      const placed = [];
      for (const seller of sellers) {
        placed.push({
          seller,
          order: await placeOrder(seller, [
            { productId: FIRST_ID, quantity: 1 },
            { productId: SECOND_ID, quantity: 1 },
          ]),
        });
      }
      // Buyers' carts list the products in the opposite order from the sellers'.
      for (const buyer of buyers) {
        await prisma.cartItem.create({
          data: { userId: buyer.id, productId: SECOND_ID, quantity: 1 },
        });
        await prisma.cartItem.create({
          data: { userId: buyer.id, productId: FIRST_ID, quantity: 1 },
        });
      }

      const responses = await Promise.all([
        ...placed.map(({ seller, order }) => cancel(seller, order.id)),
        ...buyers.map((buyer) =>
          api()
            .post('/api/v1/orders')
            .set(as(buyer))
            .set('Idempotency-Key', `key-${randomUUID()}`)
            .send({ shippingAddress: ADDRESS }),
        ),
      ]);

      // Six cancellations (200) first, then six checkouts (201), in the order they were sent.
      expect(responses.map((r) => r.status)).toEqual([
        200, 200, 200, 200, 200, 200, 201, 201, 201, 201, 201, 201,
      ]);
      // 6 units of each were taken by the sellers' orders and returned by their cancellations,
      // while the buyers' 6 orders took 6 more.
      expect(await stockOf(first.id)).toBe(94);
      expect(await stockOf(second.id)).toBe(94);
      await expectStockInvariant(prisma, { [first.id]: 100, [second.id]: 100 });
    });
  });

  describe('administrators', () => {
    describe('listing orders', () => {
      it('lists every customer’s orders, newest first, each with its customer', async () => {
        const a = await insertOrder({ user: ann, createdAt: new Date('2026-10-01T08:00:00Z') });
        const b = await insertOrder({ user: bob, createdAt: new Date('2026-10-02T08:00:00Z') });
        const c = await insertOrder({
          user: ann,
          status: 'SHIPPED',
          paymentStatus: 'PAID',
          createdAt: new Date('2026-10-03T08:00:00Z'),
        });

        const page = await adminList();

        expect(page.items.map((o) => o.id)).toEqual([c, b, a]);
        expect(page.items[0]).toEqual({
          id: c,
          status: 'SHIPPED',
          paymentStatus: 'PAID',
          totalAmount: '10.00',
          itemsCount: 1,
          createdAt: '2026-10-03T08:00:00.000Z',
          customer: { id: ann.id, email: 'ann@example.com', name: 'CUSTOMER' },
        });
        expect(page.items[1].customer).toMatchObject({ id: bob.id, email: 'bob@example.com' });
        expect(page.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
        expect(JSON.stringify(page)).not.toContain('passwordHash');
      });

      it('filters by status', async () => {
        await insertOrder({ user: ann, status: 'NEW' });
        const shipped = await insertOrder({ user: bob, status: 'SHIPPED', paymentStatus: 'PAID' });

        const page = await adminList('?status=SHIPPED');

        expect(page.items.map((o) => o.id)).toEqual([shipped]);
        expect(page.meta.total).toBe(1);
      });

      it('filters by UTC days, both ends inclusive, to the millisecond', async () => {
        const times = {
          before: '2026-09-30T23:59:59.999Z',
          startOfFrom: '2026-10-01T00:00:00.000Z',
          endOfTo: '2026-10-02T23:59:59.999Z',
          after: '2026-10-03T00:00:00.000Z',
        };
        const ids: Record<string, string> = {};
        for (const [name, at] of Object.entries(times)) {
          ids[name] = await insertOrder({ user: ann, createdAt: new Date(at) });
        }

        const inRange = (await adminList('?from=2026-10-01&to=2026-10-02')).items.map((o) => o.id);
        expect(inRange).toEqual([ids.endOfTo, ids.startOfFrom]);

        const onlyFrom = (await adminList('?from=2026-10-02')).items.map((o) => o.id);
        expect(onlyFrom).toEqual([ids.after, ids.endOfTo]);
        const onlyTo = (await adminList('?to=2026-10-01')).items.map((o) => o.id);
        expect(onlyTo).toEqual([ids.startOfFrom, ids.before]);
        const singleDay = (await adminList('?from=2026-10-03&to=2026-10-03')).items.map(
          (o) => o.id,
        );
        expect(singleDay).toEqual([ids.after]);
      });

      it('filters by part of the customer’s email, ignoring case, and treats % and _ literally', async () => {
        const anns = await insertOrder({ user: ann });
        await insertOrder({ user: bob });

        expect((await adminList('?customerEmail=ANN@Example')).items.map((o) => o.id)).toEqual([
          anns,
        ]);
        expect((await adminList('?customerEmail=bob')).meta.total).toBe(1);
        expect((await adminList('?customerEmail=@example.com')).meta.total).toBe(2);
        expect((await adminList('?customerEmail=nobody')).items).toEqual([]);
        // A wildcard would match both customers; taken literally it matches none.
        expect((await adminList('?customerEmail=%25')).items).toEqual([]);
        expect((await adminList('?customerEmail=_nn')).items).toEqual([]);
      });

      it('combines the filters and the paging', async () => {
        const wanted = await insertOrder({
          user: ann,
          status: 'NEW',
          createdAt: new Date('2026-10-02T08:00:00Z'),
        });
        await insertOrder({
          user: ann,
          status: 'SHIPPED',
          createdAt: new Date('2026-10-02T09:00:00Z'),
        });
        await insertOrder({
          user: bob,
          status: 'NEW',
          createdAt: new Date('2026-10-02T10:00:00Z'),
        });
        await insertOrder({
          user: ann,
          status: 'NEW',
          createdAt: new Date('2026-10-05T10:00:00Z'),
        });

        const page = await adminList(
          '?status=NEW&customerEmail=ann&from=2026-10-02&to=2026-10-02&limit=1&page=1',
        );

        expect(page.items.map((o) => o.id)).toEqual([wanted]);
        expect(page.meta).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 });
      });

      it.each([
        ['`to` earlier than `from`', '?from=2026-10-05&to=2026-10-04', 'to'],
        ['an impossible day', '?from=2026-02-30', 'from'],
        ['a date with a time', '?from=2026-10-01T00:00:00Z', 'from'],
        ['a malformed day', '?to=1-10-2026', 'to'],
        ['an unknown status', '?status=LOST', 'status'],
        ['an empty email filter', '?customerEmail=', 'customerEmail'],
        ['a limit above the cap', '?limit=500', 'limit'],
        ['an unknown parameter', '?userId=x', 'userId'],
      ])('rejects %s with 400, naming the field', async (_name, query, field) => {
        const response = await api().get(`/api/v1/admin/orders${query}`).set(as(admin)).expect(400);

        expect(response.body).toMatchObject({
          code: 'VALIDATION_FAILED',
          details: [expect.objectContaining({ field })],
        });
      });
    });

    describe('reading an order', () => {
      it('returns the full order with its customer, whoever owns it', async () => {
        const placed = await placeOrder(ann, [{ productId: widgetId, quantity: 2 }]);

        const response = await api()
          .get(`/api/v1/admin/orders/${placed.id}`)
          .set(as(admin))
          .expect(200);

        expect(response.body).toEqual({
          ...placed,
          allowedTransitions: ['CANCELLED'],
          customer: { id: ann.id, email: 'ann@example.com', name: 'CUSTOMER' },
        });
      });

      it('answers 404 ORDER_NOT_FOUND for an unknown id and 400 for a malformed one', async () => {
        const response = await api()
          .get(`/api/v1/admin/orders/${MISSING_ID}`)
          .set(as(admin))
          .expect(404);

        expect(response.body).toMatchObject({ code: 'ORDER_NOT_FOUND' });
        await api().get('/api/v1/admin/orders/not-a-uuid').set(as(admin)).expect(400);
      });
    });

    describe('changing the status', () => {
      it('refuses NEW → PROCESSING: an order is processed only after it is paid', async () => {
        const id = await insertOrder({ user: ann, status: 'NEW' });

        const response = await changeStatus(id, 'PROCESSING').expect(409);

        expect(response.body).toMatchObject({
          code: 'INVALID_ORDER_TRANSITION',
          details: { currentStatus: 'NEW', requestedStatus: 'PROCESSING' },
        });
        expect(await statusOf(id)).toBe('NEW');
      });

      it('ships and completes a paid order, one step at a time, leaving payment and stock alone', async () => {
        const mouse = await product('Mouse', '19.99', 10);
        const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
        await markPaid(placed.id);

        const shipped = (await changeStatus(placed.id, 'SHIPPED').expect(200))
          .body as AdminOrderResponse;
        expect(shipped).toMatchObject({
          status: 'SHIPPED',
          paymentStatus: 'PAID',
          cancelReason: null,
          allowedTransitions: ['COMPLETED'],
          customer: { email: 'ann@example.com' },
        });
        expect(new Date(shipped.updatedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(placed.updatedAt).getTime(),
        );

        // Skipping a step is refused.
        await changeStatus(placed.id, 'PROCESSING').expect(409);
        const completed = (await changeStatus(placed.id, 'COMPLETED').expect(200))
          .body as AdminOrderResponse;
        expect(completed).toMatchObject({
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          allowedTransitions: [],
        });

        expect(await stockOf(mouse.id)).toBe(7);
        // The customer sees the same status, and nothing left to do.
        expect(
          (await api().get(`/api/v1/orders/${placed.id}`).set(as(ann)).expect(200)).body,
        ).toMatchObject({
          status: 'COMPLETED',
          allowedTransitions: [],
        });
      });

      it('cannot complete an order that has not shipped, or ship one that is NEW', async () => {
        const processing = await insertOrder({
          user: ann,
          status: 'PROCESSING',
          paymentStatus: 'PAID',
        });
        const fresh = await insertOrder({ user: ann, status: 'NEW' });

        await changeStatus(processing, 'COMPLETED').expect(409);
        await changeStatus(fresh, 'SHIPPED').expect(409);
        await changeStatus(fresh, 'COMPLETED').expect(409);
        expect(await statusOf(processing)).toBe('PROCESSING');
        expect(await statusOf(fresh)).toBe('NEW');
      });

      it('cancels a NEW order: ADMIN_ACTION, payment voided, stock back, catalog current', async () => {
        const mouse = await product('Mouse', '19.99', 10);
        const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
        expect(
          ((await api().get(`/api/v1/products/${mouse.id}`).expect(200)).body as ProductResponse)
            .stock,
        ).toBe(7);

        const response = await changeStatus(placed.id, 'CANCELLED').expect(200);

        expect(response.body).toMatchObject({
          status: 'CANCELLED',
          paymentStatus: 'VOIDED',
          cancelReason: 'ADMIN_ACTION',
          allowedTransitions: [],
        });
        expect(await stockOf(mouse.id)).toBe(10);
        expect(
          ((await api().get(`/api/v1/products/${mouse.id}`).expect(200)).body as ProductResponse)
            .stock,
        ).toBe(10);
        await expectStockInvariant(prisma, { [mouse.id]: 10 });
        // The customer is told why.
        expect(
          (await api().get(`/api/v1/orders/${placed.id}`).set(as(ann)).expect(200)).body,
        ).toMatchObject({
          status: 'CANCELLED',
          cancelReason: 'ADMIN_ACTION',
        });
      });

      it('cancels a PROCESSING order: payment refunded, stock back', async () => {
        const mouse = await product('Mouse', '19.99', 10);
        const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
        await markPaid(placed.id);

        const response = await changeStatus(placed.id, 'CANCELLED').expect(200);

        expect(response.body).toMatchObject({
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          cancelReason: 'ADMIN_ACTION',
        });
        expect(await stockOf(mouse.id)).toBe(10);
      });

      it.each([
        ['SHIPPED', 'CANCELLED'],
        ['SHIPPED', 'SHIPPED'],
        ['COMPLETED', 'CANCELLED'],
        ['COMPLETED', 'SHIPPED'],
        ['CANCELLED', 'CANCELLED'],
        ['CANCELLED', 'SHIPPED'],
      ] as const)('refuses %s → %s and leaves the stock alone', async (from, to) => {
        const mouse = await product('Mouse', '19.99', 10);
        const placed = await placeOrder(ann, [{ productId: mouse.id, quantity: 3 }]);
        await prisma.order.update({ where: { id: placed.id }, data: { status: from, ...PAID } });

        const response = await changeStatus(placed.id, to).expect(409);

        expect(response.body).toMatchObject({
          code: 'INVALID_ORDER_TRANSITION',
          details: { currentStatus: from, requestedStatus: to },
        });
        expect(await statusOf(placed.id)).toBe(from);
        expect(await stockOf(mouse.id)).toBe(7);
      });

      it('answers 404 for an unknown order and 400 for a bad id or body', async () => {
        const id = await insertOrder({ user: ann });

        await changeStatus(MISSING_ID, 'CANCELLED').expect(404);
        await api()
          .patch('/api/v1/admin/orders/not-a-uuid/status')
          .set(as(admin))
          .send({ status: 'CANCELLED' })
          .expect(400);
        for (const body of [{}, { status: 'DELIVERED' }, { status: 'cancelled' }, { status: 5 }]) {
          const response = await api()
            .patch(`/api/v1/admin/orders/${id}/status`)
            .set(as(admin))
            .send(body)
            .expect(400);
          expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
        }
        // Reasons and payment states are decided by the system, never taken from the request.
        await api()
          .patch(`/api/v1/admin/orders/${id}/status`)
          .set(as(admin))
          .send({ status: 'CANCELLED', paymentStatus: 'PAID', cancelReason: 'CUSTOMER_REQUEST' })
          .expect(400);
        expect(await statusOf(id)).toBe('NEW');
      });
    });

    it('every admin order route is for administrators only', async () => {
      const id = await insertOrder({ user: ann });

      await api().get('/api/v1/admin/orders').set(as(ann)).expect(403);
      await api().get(`/api/v1/admin/orders/${id}`).set(as(ann)).expect(403);
      await api()
        .patch(`/api/v1/admin/orders/${id}/status`)
        .set(as(ann))
        .send({ status: 'CANCELLED' })
        .expect(403);
      await api().get('/api/v1/admin/orders').expect(401);
      await api()
        .patch(`/api/v1/admin/orders/${id}/status`)
        .send({ status: 'CANCELLED' })
        .expect(401);
      expect(await statusOf(id)).toBe('NEW');
    });
  });
});
