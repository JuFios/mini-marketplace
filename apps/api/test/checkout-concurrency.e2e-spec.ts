import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import type { OrderResponse } from '../src/modules/orders/dto/order.response.dto';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';
import { expectStockInvariant } from './helpers/stock-invariant';

const ADDRESS = '221B Baker Street, London NW1 6XE';

/**
 * Checkouts racing each other through the real HTTP stack and a real PostgreSQL. Requests are
 * fired together with Promise.all, so their transactions overlap; every assertion must hold for
 * any interleaving the database picks.
 */
describe('checkout under concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;

  const api = () => request(httpServer(app));

  const product = (name: string, stock: number) =>
    prisma.product.create({ data: { name, description: '', price: '10.00', stock, categoryId } });
  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
  const customers = (count: number) =>
    Promise.all(
      Array.from({ length: count }, (_, i) =>
        createUserWithToken(app, Role.CUSTOMER, `customer${i}@example.com`),
      ),
    );
  /** Fills a cart; `createdAt` follows the given order, so the cart lists the lines that way. */
  const fillCart = (user: TestUser, lines: [productId: string, quantity: number][]) =>
    prisma.cartItem.createMany({
      data: lines.map(([productId, quantity], i) => ({
        userId: user.id,
        productId,
        quantity,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      })),
    });
  const checkout = (user: TestUser, key: string) =>
    api()
      .post('/api/v1/orders')
      .set({ Authorization: user.bearer, 'Idempotency-Key': key })
      .send({ shippingAddress: ADDRESS });
  const statusesOf = (responses: Response[]) => responses.map((r) => r.status).sort();
  const times = (count: number, status: number): number[] =>
    Array.from({ length: count }, () => status);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    categoryId = (await prisma.category.create({ data: { name: 'Hot items' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sells exactly the stock: 20 customers race for 5 units → 5 orders, 15 × 409, stock 0', async () => {
    const mouse = await product('Mouse', 5);
    const buyers = await customers(20);
    await prisma.cartItem.createMany({
      data: buyers.map((buyer) => ({ userId: buyer.id, productId: mouse.id, quantity: 1 })),
    });

    const responses = await Promise.all(buyers.map((buyer, i) => checkout(buyer, `race-${i}-key`)));

    expect(statusesOf(responses)).toEqual([...times(5, 201), ...times(15, 409)]);
    for (const refused of responses.filter((r) => r.status === 409)) {
      expect(refused.body).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        details: [{ productId: mouse.id, requested: 1, available: 0 }],
      });
    }
    expect(await stockOf(mouse.id)).toBe(0);
    expect(await prisma.order.count()).toBe(5);
    expect((await prisma.orderItem.aggregate({ _sum: { quantity: true } }))._sum.quantity).toBe(5);
    await expectStockInvariant(prisma, { [mouse.id]: 5 });
    // The five buyers' carts are empty; everyone else keeps the line for a later attempt.
    expect(await prisma.cartItem.count()).toBe(15);
  });

  it('never deadlocks: overlapping carts listed in opposite orders, 20 rounds, invariants hold', async () => {
    // a, b, c in ascending id order, i.e. the order in which checkouts lock them.
    const [a, b, c] = (
      await Promise.all([product('A', 30), product('B', 40), product('C', 25)])
    ).sort((x, y) => (x.id < y.id ? -1 : 1));
    const initialStock = Object.fromEntries([a, b, c].map((p) => [p.id, p.stock]));
    const buyers = await customers(3);
    // Locking rows in the order a cart lists them would let these carts deadlock each other.
    const carts: [string, number][][] = [
      [
        [a.id, 1],
        [b.id, 1],
        [c.id, 1],
      ],
      [
        [c.id, 2],
        [b.id, 1],
        [a.id, 2],
      ],
      [
        [b.id, 1],
        [c.id, 1],
        [a.id, 1],
      ],
    ];

    const statuses: number[] = [];
    for (let round = 0; round < 20; round += 1) {
      // Refused checkouts leave their lines behind: every round starts from the same carts.
      await prisma.cartItem.deleteMany();
      for (const [i, buyer] of buyers.entries()) await fillCart(buyer, carts[i]);

      const responses = await Promise.all(
        buyers.map((buyer, i) => checkout(buyer, `round-${round}-buyer-${i}`)),
      );

      for (const response of responses) {
        // A deadlock would surface as 409 CONCURRENT_UPDATE (or a 500): neither may happen.
        if (response.status !== 201) {
          expect(response.status).toBe(409);
          expect((response.body as { code: string }).code).toBe('INSUFFICIENT_STOCK');
        }
        statuses.push(response.status);
      }
    }

    await expectStockInvariant(prisma, initialStock);
    // Stock runs out halfway: both outcomes really happened.
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);
  });

  it('one key sent five times at once (double click): one order, the others replay it', async () => {
    const mouse = await product('Mouse', 10);
    const [ann] = await customers(1);
    await fillCart(ann, [[mouse.id, 2]]);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => checkout(ann, 'double-click-key')),
    );

    expect(statusesOf(responses)).toEqual([200, 200, 200, 200, 201]);
    const ids = new Set(responses.map((r) => (r.body as OrderResponse).id));
    expect(ids.size).toBe(1);
    for (const replay of responses.filter((r) => r.status === 200)) {
      expect(replay.headers['idempotent-replayed']).toBe('true');
    }
    expect(await prisma.order.count()).toBe(1);
    expect(await stockOf(mouse.id)).toBe(8);
    await expectStockInvariant(prisma, { [mouse.id]: 10 });
  });

  it('two tabs, two keys, one cart: one order, the other finds the cart empty', async () => {
    const mouse = await product('Mouse', 10);
    const pad = await product('Mouse pad', 10);
    const [ann] = await customers(1);
    await fillCart(ann, [
      [mouse.id, 1],
      [pad.id, 2],
    ]);

    const responses = await Promise.all([
      checkout(ann, 'first-tab-key'),
      checkout(ann, 'second-tab-key'),
    ]);

    expect(statusesOf(responses)).toEqual([201, 409]);
    expect(responses.find((r) => r.status === 409)?.body).toMatchObject({ code: 'CART_EMPTY' });
    expect(await prisma.order.count()).toBe(1);
    await expectStockInvariant(prisma, { [mouse.id]: 10, [pad.id]: 10 });
    expect(await stockOf(pad.id)).toBe(8);
  });

  it('archiving a product during checkouts: each one either completes first or is refused, stock stays exact', async () => {
    const lamp = await product('Lamp', 10);
    const buyers = await customers(5);
    const admin = await createUserWithToken(app, Role.ADMIN);
    for (const buyer of buyers) await fillCart(buyer, [[lamp.id, 1]]);

    const [archive, ...responses] = await Promise.all([
      api().delete(`/api/v1/admin/products/${lamp.id}`).set({ Authorization: admin.bearer }),
      ...buyers.map((buyer, i) => checkout(buyer, `archive-race-${i}`)),
    ]);

    expect(archive.status).toBe(204);
    for (const response of responses) {
      if (response.status !== 201) {
        expect(response.status).toBe(409);
        expect((response.body as { code: string }).code).toBe('PRODUCT_UNAVAILABLE');
      }
    }
    const sold = responses.filter((r) => r.status === 201).length;
    expect(await prisma.order.count()).toBe(sold);
    expect(await stockOf(lamp.id)).toBe(10 - sold);
    await expectStockInvariant(prisma, { [lamp.id]: 10 });

    // From now on the product cannot be bought, and a refusal takes no stock.
    const late = await createUserWithToken(app, Role.CUSTOMER, 'late@example.com');
    await fillCart(late, [[lamp.id, 1]]);
    expect((await checkout(late, 'after-archive-key').expect(409)).body).toMatchObject({
      code: 'PRODUCT_UNAVAILABLE',
    });
    expect(await stockOf(lamp.id)).toBe(10 - sold);
  });
});
