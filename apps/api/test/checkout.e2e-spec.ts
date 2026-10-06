import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import type { AuthResponse } from '../src/modules/auth/dto/auth.response.dto';
import type { CartResponse } from '../src/modules/cart/dto/cart.response.dto';
import type { OrderResponse } from '../src/modules/orders/dto/order.response.dto';
import { ORDER_EVENTS_PUBLISHER } from '../src/modules/orders/order-events.publisher';
import type { ProductResponse } from '../src/modules/products/dto/product.response.dto';
import { createUserWithToken, PASSWORD, register, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';
import { expectStockInvariant } from './helpers/stock-invariant';

const ADDRESS = '221B Baker Street, London NW1 6XE';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
// Fixed ids make the lock order (ascending product id) known: FIRST is always decremented first.
const FIRST_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_ID = '00000000-0000-4000-8000-000000000002';

interface HandOver {
  orderId: string;
  /** Whether the order was visible to another connection, i.e. committed, at hand-over time. */
  committed: boolean;
}

describe('checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ann: TestUser;
  let bob: TestUser;
  let admin: TestUser;
  let categoryId: string;

  const handOvers: HandOver[] = [];
  const orderEvents = {
    orderCreated: jest.fn(async (orderId: string) => {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      handOvers.push({ orderId, committed: order !== null });
    }),
  };

  const api = () => request(httpServer(app));
  const as = (user: TestUser) => ({ Authorization: user.bearer });

  const product = (name: string, price: string, stock: number, id?: string) =>
    prisma.product.create({ data: { id, name, description: '', price, stock, categoryId } });
  const putInCart = (user: TestUser, productId: string, quantity: number) =>
    prisma.cartItem.create({ data: { userId: user.id, productId, quantity } });
  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
  const cartOf = async (user: TestUser) =>
    (await api().get('/api/v1/cart').set(as(user)).expect(200)).body as CartResponse;

  const checkout = (
    user: TestUser,
    key: string | undefined,
    body: Record<string, unknown> = { shippingAddress: ADDRESS },
  ) => {
    const call = api().post('/api/v1/orders').set(as(user));
    return (key === undefined ? call : call.set('Idempotency-Key', key)).send(body);
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ORDER_EVENTS_PUBLISHER).useValue(orderEvents),
    );
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    handOvers.length = 0;
    orderEvents.orderCreated.mockClear();
    ann = await createUserWithToken(app, Role.CUSTOMER, 'ann@example.com');
    bob = await createUserWithToken(app, Role.CUSTOMER, 'bob@example.com');
    admin = await createUserWithToken(app, Role.ADMIN);
    categoryId = (await prisma.category.create({ data: { name: 'Peripherals' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the critical flow', () => {
    it('log in → add to cart → check out → 201, stock reduced, cart empty, lines snapshotted', async () => {
      await register(app, 'carol@example.com');
      const login = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'carol@example.com', password: PASSWORD })
        .expect(200);
      const carol = { Authorization: `Bearer ${(login.body as AuthResponse).accessToken}` };

      const keyboard = await product('Mechanical keyboard', '49.90', 10);
      const cable = await product('USB-C cable', '5.50', 3);
      // Puts the product in the public cache first: the checkout must invalidate it.
      expect(
        ((await api().get(`/api/v1/products/${keyboard.id}`).expect(200)).body as ProductResponse)
          .stock,
      ).toBe(10);

      await api()
        .post('/api/v1/cart/items')
        .set(carol)
        .send({ productId: keyboard.id, quantity: 2 })
        .expect(200);
      await api()
        .post('/api/v1/cart/items')
        .set(carol)
        .send({ productId: cable.id, quantity: 3 })
        .expect(200);

      const placed = await api()
        .post('/api/v1/orders')
        .set(carol)
        .set('Idempotency-Key', 'critical-flow-0001')
        .send({ shippingAddress: ADDRESS })
        .expect(201);

      const order = placed.body as OrderResponse;
      const { id, createdAt, updatedAt, ...content } = order;
      expect(placed.headers.location).toBe(`/api/v1/orders/${id}`);
      expect(placed.headers['idempotent-replayed']).toBeUndefined();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(new Date(createdAt).toISOString()).toBe(createdAt);
      expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
      expect(content).toEqual({
        status: 'NEW',
        paymentStatus: 'PENDING',
        cancelReason: null,
        totalAmount: '116.30',
        shippingAddress: ADDRESS,
        allowedTransitions: ['CANCELLED'],
        items: [
          {
            productId: keyboard.id,
            productName: 'Mechanical keyboard',
            unitPrice: '49.90',
            quantity: 2,
            lineTotal: '99.80',
          },
          {
            productId: cable.id,
            productName: 'USB-C cable',
            unitPrice: '5.50',
            quantity: 3,
            lineTotal: '16.50',
          },
        ],
      });

      // Stock reduced by exactly the quantities bought, in the database and in the public catalog.
      expect(await stockOf(keyboard.id)).toBe(8);
      expect(await stockOf(cable.id)).toBe(0);
      const publicKeyboard = (await api().get(`/api/v1/products/${keyboard.id}`).expect(200))
        .body as ProductResponse;
      expect(publicKeyboard.stock).toBe(8);
      await expectStockInvariant(prisma, { [keyboard.id]: 10, [cable.id]: 3 });

      // The cart is empty and the order reads back exactly as it was returned.
      expect((await api().get('/api/v1/cart').set(carol).expect(200)).body).toMatchObject({
        items: [],
        totalQuantity: 0,
      });
      expect((await api().get(`/api/v1/orders/${id}`).set(carol).expect(200)).body).toEqual(order);

      // The snapshot is stored, and the order was handed over once, after it had been committed.
      const lines = await prisma.orderItem.findMany({
        where: { orderId: id },
        orderBy: { productName: 'asc' },
      });
      expect(
        lines.map((l) => [l.productId, l.productName, l.unitPrice.toFixed(2), l.quantity]),
      ).toEqual([
        [keyboard.id, 'Mechanical keyboard', '49.90', 2],
        [cable.id, 'USB-C cable', '5.50', 3],
      ]);
      expect(handOvers).toEqual([{ orderId: id, committed: true }]);
    });

    it('charges the price at checkout time, and keeps it whatever happens to the product later', async () => {
      const lamp = await product('Desk lamp', '20.00', 5);
      await putInCart(ann, lamp.id, 1);
      // Changed after the customer added it: the order uses the current price.
      await prisma.product.update({ where: { id: lamp.id }, data: { price: '25.00' } });

      const order = (await checkout(ann, 'price-at-checkout-1').expect(201)).body as OrderResponse;
      await api()
        .patch(`/api/v1/admin/products/${lamp.id}`)
        .set(as(admin))
        .send({ name: 'Floor lamp', price: '99.00' })
        .expect(200);

      const reread = (await api().get(`/api/v1/orders/${order.id}`).set(as(ann)).expect(200))
        .body as OrderResponse;
      expect(reread).toMatchObject({
        totalAmount: '25.00',
        items: [{ productName: 'Desk lamp', unitPrice: '25.00', lineTotal: '25.00' }],
      });
    });

    it('stores the shipping address trimmed', async () => {
      const lamp = await product('Desk lamp', '20.00', 5);
      await putInCart(ann, lamp.id, 1);

      const order = (
        await checkout(ann, 'trimmed-address-1', { shippingAddress: `   ${ADDRESS}  ` }).expect(201)
      ).body as OrderResponse;

      expect(order.shippingAddress).toBe(ADDRESS);
    });
  });

  describe('validation', () => {
    it.each([
      ['missing', undefined],
      ['too short', 'abc1234'],
      ['too long', 'k'.repeat(65)],
      ['with spaces', 'my order key'],
      ['with other characters', 'order#12345'],
    ])(
      'rejects a %s Idempotency-Key with 400 IDEMPOTENCY_KEY_REQUIRED and changes nothing',
      async (_label, key) => {
        const lamp = await product('Desk lamp', '20.00', 5);
        await putInCart(ann, lamp.id, 2);

        const response = await checkout(ann, key).expect(400);

        expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
        expect(await stockOf(lamp.id)).toBe(5);
        expect((await cartOf(ann)).totalQuantity).toBe(2);
        expect(await prisma.order.count()).toBe(0);
      },
    );

    it.each([
      ['no shipping address', {}],
      ['an address under 10 characters once trimmed', { shippingAddress: '   Short    ' }],
      ['an address over 500 characters', { shippingAddress: 'x'.repeat(501) }],
      ['a non-string address', { shippingAddress: 1234567890 }],
      ['an unknown field', { shippingAddress: ADDRESS, total: '0.01' }],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_label, body) => {
      const lamp = await product('Desk lamp', '20.00', 5);
      await putInCart(ann, lamp.id, 1);

      const response = await checkout(ann, 'validation-key-1', body).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await prisma.order.count()).toBe(0);
    });
  });

  describe('refusals', () => {
    it('refuses an empty cart with 409 CART_EMPTY', async () => {
      const response = await checkout(ann, 'empty-cart-key-1').expect(409);

      expect(response.body).toMatchObject({ code: 'CART_EMPTY' });
    });

    it('refuses a line above the stock left with the numbers, and rolls back the lines already taken', async () => {
      const first = await product('Mouse', '10.00', 5, FIRST_ID);
      const second = await product('Monitor', '200.00', 1, SECOND_ID);
      await putInCart(ann, first.id, 2);
      await putInCart(ann, second.id, 3);

      const response = await checkout(ann, 'short-stock-key-1').expect(409);

      expect(response.body).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for "Monitor"',
        details: [{ productId: second.id, requested: 3, available: 1 }],
      });
      // The mouse was decremented first, inside the same transaction: the rollback restored it.
      expect(await stockOf(first.id)).toBe(5);
      expect(await stockOf(second.id)).toBe(1);
      expect((await cartOf(ann)).totalQuantity).toBe(5);
      expect(await prisma.order.count()).toBe(0);
      expect(orderEvents.orderCreated).not.toHaveBeenCalled();
    });

    it('refuses an archived product with 409 PRODUCT_UNAVAILABLE and changes no stock', async () => {
      const first = await product('Mouse', '10.00', 5, FIRST_ID);
      const second = await product('Old monitor', '200.00', 5, SECOND_ID);
      await putInCart(ann, first.id, 1);
      await putInCart(ann, second.id, 1);
      await api().delete(`/api/v1/admin/products/${second.id}`).set(as(admin)).expect(204);

      const response = await checkout(ann, 'archived-key-1').expect(409);

      expect(response.body).toMatchObject({
        code: 'PRODUCT_UNAVAILABLE',
        message: '"Old monitor" is no longer available',
        details: [{ productId: second.id }],
      });
      expect(await stockOf(first.id)).toBe(5);
      expect(await stockOf(second.id)).toBe(5);
      expect((await cartOf(ann)).items).toHaveLength(2);
      expect(await prisma.order.count()).toBe(0);
    });

    it('lets a refused key be used again once the cart is fixed', async () => {
      const mouse = await product('Mouse', '10.00', 1);
      await putInCart(ann, mouse.id, 2);
      await checkout(ann, 'fix-and-retry-1').expect(409);

      await api()
        .patch(`/api/v1/cart/items/${mouse.id}`)
        .set(as(ann))
        .send({ quantity: 1 })
        .expect(200);

      await checkout(ann, 'fix-and-retry-1').expect(201);
      expect(await stockOf(mouse.id)).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('replays a retried key: 200, Idempotent-Replayed, the same order, nothing taken twice', async () => {
      const mouse = await product('Mouse', '10.00', 10);
      await putInCart(ann, mouse.id, 2);
      const first = await checkout(ann, 'retry-key-0001').expect(201);
      // The customer has since filled the cart again: a retry must not buy it.
      await putInCart(ann, mouse.id, 3);

      const retry = await checkout(ann, 'retry-key-0001').expect(200);

      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.headers.location).toBeUndefined();
      expect(retry.body).toEqual(first.body);
      expect(await prisma.order.count()).toBe(1);
      expect(await stockOf(mouse.id)).toBe(8);
      expect((await cartOf(ann)).totalQuantity).toBe(3);
      expect(orderEvents.orderCreated).toHaveBeenCalledTimes(1);
    });

    it('scopes keys to the customer: the same key from someone else is a new order', async () => {
      const mouse = await product('Mouse', '10.00', 10);
      await putInCart(ann, mouse.id, 1);
      await putInCart(bob, mouse.id, 1);

      const annOrder = (await checkout(ann, 'shared-key-0001').expect(201)).body as OrderResponse;
      const bobOrder = (await checkout(bob, 'shared-key-0001').expect(201)).body as OrderResponse;

      expect(bobOrder.id).not.toBe(annOrder.id);
      expect(await stockOf(mouse.id)).toBe(8);
    });

    it('answers a new key after the cart was bought with 409 CART_EMPTY', async () => {
      const mouse = await product('Mouse', '10.00', 10);
      await putInCart(ann, mouse.id, 1);
      await checkout(ann, 'first-attempt-1').expect(201);

      const response = await checkout(ann, 'second-attempt-1').expect(409);

      expect(response.body).toMatchObject({ code: 'CART_EMPTY' });
    });
  });

  describe('reading an order', () => {
    it('answers 404 ORDER_NOT_FOUND for another customer’s order, exactly as for a missing one', async () => {
      const mouse = await product('Mouse', '10.00', 10);
      await putInCart(ann, mouse.id, 1);
      const order = (await checkout(ann, 'private-order-1').expect(201)).body as OrderResponse;

      const foreign = await api().get(`/api/v1/orders/${order.id}`).set(as(bob)).expect(404);
      const missing = await api().get(`/api/v1/orders/${MISSING_ID}`).set(as(bob)).expect(404);

      expect(foreign.body).toMatchObject({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
      expect(missing.body).toMatchObject({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    });

    it('rejects a malformed order id with 400', async () => {
      await api().get('/api/v1/orders/not-a-uuid').set(as(ann)).expect(400);
    });
  });

  describe('access', () => {
    it('forbids administrators: they do not shop', async () => {
      await checkout(admin, 'admin-key-0001').expect(403);
      await api().get(`/api/v1/orders/${MISSING_ID}`).set(as(admin)).expect(403);
    });

    it('requires a token', async () => {
      await api()
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'anonymous-key-1')
        .send({ shippingAddress: ADDRESS })
        .expect(401);
      await api().get(`/api/v1/orders/${MISSING_ID}`).expect(401);
    });
  });

  describe('after the commit', () => {
    it('still answers 201 when handing the order over fails: the order stands', async () => {
      const mouse = await product('Mouse', '10.00', 10);
      await putInCart(ann, mouse.id, 1);
      orderEvents.orderCreated.mockRejectedValueOnce(new Error('queue unavailable'));

      const order = (await checkout(ann, 'handover-fails-1').expect(201)).body as OrderResponse;

      expect(await prisma.order.findUnique({ where: { id: order.id } })).not.toBeNull();
      expect(await stockOf(mouse.id)).toBe(9);
    });
  });
});
