import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import type { CartResponse } from '../src/modules/cart/dto/cart.response.dto';
import { CartService } from '../src/modules/cart/cart.service';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('cart (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ann: TestUser;
  let bob: TestUser;
  let admin: TestUser;
  let categoryId: string;

  const api = () => request(httpServer(app));
  const as = (user: TestUser) => ({ Authorization: user.bearer });

  const product = (name: string, price: string, stock: number, deletedAt: Date | null = null) =>
    prisma.product.create({ data: { name, description: '', price, stock, categoryId, deletedAt } });

  const add = (user: TestUser, productId: string, quantity: number) =>
    api().post('/api/v1/cart/items').set(as(user)).send({ productId, quantity });
  const set = (user: TestUser, productId: string, quantity: number) =>
    api().patch(`/api/v1/cart/items/${productId}`).set(as(user)).send({ quantity });
  const cartOf = async (user: TestUser) =>
    (await api().get('/api/v1/cart').set(as(user)).expect(200)).body as CartResponse;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await createUserWithToken(app, Role.CUSTOMER, 'ann@example.com');
    bob = await createUserWithToken(app, Role.CUSTOMER, 'bob@example.com');
    admin = await createUserWithToken(app, Role.ADMIN);
    categoryId = (await prisma.category.create({ data: { name: 'Gadgets' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('reading', () => {
    it('is an empty cart for a new customer', async () => {
      expect(await cartOf(ann)).toEqual({
        items: [],
        totalQuantity: 0,
        subtotal: '0.00',
        hasIssues: false,
      });
    });

    it('describes each line with current price, totals and flags', async () => {
      const mouse = await product('Mouse', '24.99', 7);
      await add(ann, mouse.id, 2).expect(200);

      expect(await cartOf(ann)).toEqual({
        items: [
          {
            productId: mouse.id,
            name: 'Mouse',
            imageUrl: null,
            unitPrice: '24.99',
            quantity: 2,
            lineTotal: '49.98',
            stock: 7,
            isAvailable: true,
            exceedsStock: false,
          },
        ],
        totalQuantity: 2,
        subtotal: '49.98',
        hasIssues: false,
      });
    });

    it('adds up exactly: 3 × 0.10 + 3 × 0.20 is 0.90, not 0.8999999999999999', async () => {
      const a = await product('A', '0.10', 10);
      const b = await product('B', '0.20', 10);
      await add(ann, a.id, 3).expect(200);
      await add(ann, b.id, 3).expect(200);

      expect((await cartOf(ann)).subtotal).toBe('0.90');
    });

    it('keeps lines in the order they were added', async () => {
      const first = await product('First', '1.00', 5);
      const second = await product('Second', '1.00', 5);
      await add(ann, second.id, 1).expect(200);
      await add(ann, first.id, 1).expect(200);
      await add(ann, second.id, 1).expect(200);

      expect((await cartOf(ann)).items.map((i) => i.name)).toEqual(['Second', 'First']);
    });
  });

  describe('adding', () => {
    it('adds to the existing quantity and returns the full cart', async () => {
      const mouse = await product('Mouse', '10.00', 10);

      await add(ann, mouse.id, 2).expect(200);
      const response = await add(ann, mouse.id, 3).expect(200);

      const cart = response.body as CartResponse;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(5);
      expect(cart).toMatchObject({ totalQuantity: 5, subtotal: '50.00' });
    });

    it('refuses to go above stock, counting the quantity already held, and changes nothing', async () => {
      const mouse = await product('Mouse', '10.00', 5);
      await add(ann, mouse.id, 4).expect(200);

      const response = await add(ann, mouse.id, 2).expect(409);

      expect(response.body).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        details: [{ productId: mouse.id, requested: 6, available: 5 }],
      });
      expect((await cartOf(ann)).items[0].quantity).toBe(4);
    });

    it('allows exactly the stock that is there, and refuses a sold-out product', async () => {
      const last = await product('Last', '10.00', 3);
      const gone = await product('Gone', '10.00', 0);

      await add(ann, last.id, 3).expect(200);
      expect((await add(ann, gone.id, 1).expect(409)).body).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
      });
    });

    it('answers 404 PRODUCT_NOT_FOUND for an unknown product', async () => {
      expect((await add(ann, MISSING_ID, 1).expect(404)).body).toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
    });

    it('answers 409 PRODUCT_UNAVAILABLE for an archived product', async () => {
      const archived = await product('Old', '10.00', 5, new Date());

      expect((await add(ann, archived.id, 1).expect(409)).body).toMatchObject({
        code: 'PRODUCT_UNAVAILABLE',
      });
    });

    it('refuses a line above 99 units even when stock would allow it', async () => {
      const bulk = await product('Bulk', '1.00', 1000);
      await add(ann, bulk.id, 99).expect(200);

      expect((await add(ann, bulk.id, 1).expect(409)).body).toMatchObject({
        code: 'CART_LIMIT_EXCEEDED',
      });
      expect((await cartOf(ann)).items[0].quantity).toBe(99);
    });

    it.each([
      ['a quantity of 0', { quantity: 0 }],
      ['a quantity of 100', { quantity: 100 }],
      ['a fractional quantity', { quantity: 1.5 }],
      ['a malformed product id', { productId: 'abc' }],
      ['a client-supplied price', { price: '0.01' }],
    ])('rejects %s with 400', async (_label, override) => {
      const mouse = await product('Mouse', '10.00', 5);

      const response = await api()
        .post('/api/v1/cart/items')
        .set(as(ann))
        .send({ productId: mouse.id, quantity: 1, ...override })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('caps a cart at 50 different products, while existing ones can still be topped up', async () => {
      const products = await Promise.all(
        Array.from({ length: 51 }, (_, i) => product(`P${i}`, '1.00', 10)),
      );
      for (const p of products.slice(0, 50)) await add(ann, p.id, 1).expect(200);

      const refused = await add(ann, products[50].id, 1).expect(409);
      await add(ann, products[0].id, 1).expect(200);

      expect(refused.body).toMatchObject({ code: 'CART_LIMIT_EXCEEDED' });
      expect((await cartOf(ann)).items).toHaveLength(50);
    });
  });

  describe('setting a quantity', () => {
    it('sets an absolute value, up or down, and creates the line when it is missing', async () => {
      const mouse = await product('Mouse', '10.00', 10);

      expect(
        ((await set(ann, mouse.id, 4).expect(200)).body as CartResponse).items[0].quantity,
      ).toBe(4);
      expect(
        ((await set(ann, mouse.id, 9).expect(200)).body as CartResponse).items[0].quantity,
      ).toBe(9);
      expect(
        ((await set(ann, mouse.id, 1).expect(200)).body as CartResponse).items[0].quantity,
      ).toBe(1);
    });

    it('is idempotent: repeating the request leaves the same cart', async () => {
      const mouse = await product('Mouse', '10.00', 10);

      const first = (await set(ann, mouse.id, 3).expect(200)).body as CartResponse;
      const second = (await set(ann, mouse.id, 3).expect(200)).body as CartResponse;

      expect(second).toEqual(first);
    });

    it('refuses a quantity above stock and leaves the line untouched', async () => {
      const mouse = await product('Mouse', '10.00', 5);
      await set(ann, mouse.id, 2).expect(200);

      expect((await set(ann, mouse.id, 6).expect(409)).body).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
      });
      expect((await cartOf(ann)).items[0].quantity).toBe(2);
    });

    it('lets a customer reduce a line whose stock has dropped below it', async () => {
      const mouse = await product('Mouse', '10.00', 10);
      await set(ann, mouse.id, 8).expect(200);
      await prisma.product.update({ where: { id: mouse.id }, data: { stock: 3 } });

      await set(ann, mouse.id, 3).expect(200);
      expect((await cartOf(ann)).hasIssues).toBe(false);
    });

    it('rejects a quantity outside 1-99 and a malformed id with 400', async () => {
      const mouse = await product('Mouse', '10.00', 5);

      await set(ann, mouse.id, 0).expect(400);
      await set(ann, mouse.id, 100).expect(400);
      await api()
        .patch('/api/v1/cart/items/not-a-uuid')
        .set(as(ann))
        .send({ quantity: 1 })
        .expect(400);
    });
  });

  describe('removing', () => {
    it('removes one line, idempotently, leaving the others', async () => {
      const a = await product('A', '1.00', 5);
      const b = await product('B', '1.00', 5);
      await add(ann, a.id, 1).expect(200);
      await add(ann, b.id, 1).expect(200);

      const first = await api().delete(`/api/v1/cart/items/${a.id}`).set(as(ann)).expect(200);
      const again = await api().delete(`/api/v1/cart/items/${a.id}`).set(as(ann)).expect(200);

      expect((first.body as CartResponse).items.map((i) => i.name)).toEqual(['B']);
      expect(again.body).toEqual(first.body);
    });

    it('does not mind a product that does not exist at all', async () => {
      await api().delete(`/api/v1/cart/items/${MISSING_ID}`).set(as(ann)).expect(200);
    });

    it('empties the whole cart, and doing it twice is fine', async () => {
      const a = await product('A', '1.00', 5);
      await add(ann, a.id, 2).expect(200);

      const cleared = await api().delete('/api/v1/cart').set(as(ann)).expect(200);
      await api().delete('/api/v1/cart').set(as(ann)).expect(200);

      expect(cleared.body).toEqual({
        items: [],
        totalQuantity: 0,
        subtotal: '0.00',
        hasIssues: false,
      });
    });
  });

  describe('when the catalog changes under a cart', () => {
    it('shows an archived product as unavailable and flags the cart', async () => {
      const mouse = await product('Mouse', '10.00', 5);
      await add(ann, mouse.id, 1).expect(200);
      await prisma.product.update({ where: { id: mouse.id }, data: { deletedAt: new Date() } });

      const cart = await cartOf(ann);

      expect(cart.items[0]).toMatchObject({ isAvailable: false, exceedsStock: false });
      expect(cart.hasIssues).toBe(true);
    });

    it('flags a line that now exceeds stock', async () => {
      const mouse = await product('Mouse', '10.00', 5);
      await add(ann, mouse.id, 4).expect(200);
      await prisma.product.update({ where: { id: mouse.id }, data: { stock: 2 } });

      const cart = await cartOf(ann);

      expect(cart.items[0]).toMatchObject({ isAvailable: true, exceedsStock: true, stock: 2 });
      expect(cart.hasIssues).toBe(true);
    });

    it('always prices lines at the current price', async () => {
      const mouse = await product('Mouse', '10.00', 5);
      await add(ann, mouse.id, 2).expect(200);
      await prisma.product.update({ where: { id: mouse.id }, data: { price: '12.50' } });

      expect(await cartOf(ann)).toMatchObject({
        subtotal: '25.00',
        items: [{ unitPrice: '12.50', lineTotal: '25.00' }],
      });
    });

    it('lets the customer remove an archived line', async () => {
      const mouse = await product('Mouse', '10.00', 5);
      await add(ann, mouse.id, 1).expect(200);
      await prisma.product.update({ where: { id: mouse.id }, data: { deletedAt: new Date() } });

      const cart = (await api().delete(`/api/v1/cart/items/${mouse.id}`).set(as(ann)).expect(200))
        .body as CartResponse;

      expect(cart).toMatchObject({ items: [], hasIssues: false });
    });
  });

  describe('isolation and access', () => {
    it('keeps every customer’s cart private', async () => {
      const mouse = await product('Mouse', '10.00', 10);
      await add(ann, mouse.id, 3).expect(200);
      await add(bob, mouse.id, 1).expect(200);

      expect((await cartOf(ann)).totalQuantity).toBe(3);
      expect((await cartOf(bob)).totalQuantity).toBe(1);
      await api().delete('/api/v1/cart').set(as(bob)).expect(200);
      expect((await cartOf(ann)).totalQuantity).toBe(3);
    });

    const routes: [string, string][] = [
      ['get', '/api/v1/cart'],
      ['post', '/api/v1/cart/items'],
      ['patch', `/api/v1/cart/items/${MISSING_ID}`],
      ['delete', `/api/v1/cart/items/${MISSING_ID}`],
      ['delete', '/api/v1/cart'],
    ];
    const call = (method: string, path: string) =>
      (api() as unknown as Record<string, (p: string) => request.Test>)[method](path);

    it.each(routes)('forbids an administrator on %s %s', async (method, path) => {
      const response = await call(method, path).set(as(admin)).send({}).expect(403);

      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it.each(routes)('requires a token on %s %s', async (method, path) => {
      await call(method, path).send({}).expect(401);
    });
  });

  describe('concurrency', () => {
    it('counts every one of 10 simultaneous adds: none is lost', async () => {
      const mouse = await product('Mouse', '1.00', 50);

      const responses = await Promise.all(Array.from({ length: 10 }, () => add(ann, mouse.id, 1)));

      expect(responses.map((r) => r.status)).toEqual(Array.from({ length: 10 }, () => 200));
      expect((await cartOf(ann)).items[0].quantity).toBe(10);
    });

    it('never ends above 99 units when simultaneous adds race past the check: 409, never 500', async () => {
      const bulk = await product('Bulk', '1.00', 1000);
      await set(ann, bulk.id, 90).expect(200);

      const responses = await Promise.all(Array.from({ length: 5 }, () => add(ann, bulk.id, 5)));

      const statuses = responses.map((r) => r.status);
      expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
      const accepted = statuses.filter((s) => s === 200).length;
      expect(accepted).toBeGreaterThan(0);
      expect((await cartOf(ann)).items[0].quantity).toBe(90 + 5 * accepted);
      expect((await cartOf(ann)).items[0].quantity).toBeLessThanOrEqual(99);
    });
  });

  describe('checkout support', () => {
    it('lockItemsForCheckout returns the cart rows in product-id order', async () => {
      const products = await Promise.all(['A', 'B', 'C'].map((n) => product(n, '1.00', 5)));
      for (const p of [...products].reverse()) await add(ann, p.id, 2).expect(200);

      const rows = await prisma.$transaction((tx) =>
        app.get(CartService).lockItemsForCheckout(ann.id, tx),
      );

      expect(rows.map((r) => r.productId)).toEqual(products.map((p) => p.id).sort());
      expect(rows.every((r) => r.quantity === 2)).toBe(true);
    });

    it('removePurchased deletes only the listed lines: one added meanwhile survives', async () => {
      const bought = await product('Bought', '1.00', 5);
      const late = await product('Late', '1.00', 5);
      await add(ann, bought.id, 1).expect(200);

      await prisma.$transaction(async (tx) => {
        const cart = app.get(CartService);
        const locked = await cart.lockItemsForCheckout(ann.id, tx);
        await add(ann, late.id, 1).expect(200); // another tab, outside the transaction
        await cart.removePurchased(
          ann.id,
          locked.map((r) => r.productId),
          tx,
        );
      });

      expect((await cartOf(ann)).items.map((i) => i.name)).toEqual(['Late']);
    });

    it('serialises two checkouts of the same cart: the second waits, then finds it empty', async () => {
      const mouse = await product('Mouse', '1.00', 5);
      await add(ann, mouse.id, 1).expect(200);
      const cart = app.get(CartService);

      let firstHasLock!: () => void;
      const locked = new Promise<void>((resolve) => (firstHasLock = resolve));
      let finishFirst!: () => void;
      const hold = new Promise<void>((resolve) => (finishFirst = resolve));

      const first = prisma.$transaction(async (tx) => {
        const rows = await cart.lockItemsForCheckout(ann.id, tx);
        firstHasLock();
        await hold;
        await cart.removePurchased(
          ann.id,
          rows.map((r) => r.productId),
          tx,
        );
        return rows;
      });
      await locked;

      let secondDone = false;
      const second = prisma.$transaction(async (tx) => {
        const rows = await cart.lockItemsForCheckout(ann.id, tx);
        secondDone = true;
        return rows;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(secondDone).toBe(false); // blocked on the first transaction's row locks

      finishFirst();
      expect((await first).length).toBe(1);
      expect(await second).toEqual([]);
    });
  });
});
