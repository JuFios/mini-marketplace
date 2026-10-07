import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Paginated } from '../src/common/pagination/pagination.dto';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import type { AdminProductResponse } from '../src/modules/products/dto/product.response.dto';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('admin products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let customer: TestUser;
  let categoryId: string;

  const api = () => request(httpServer(app));
  const auth = { Authorization: '' };

  const body = (overrides: Record<string, unknown> = {}) => ({
    name: 'Wireless Mouse',
    description: 'Silent clicks',
    price: '24.99',
    categoryId,
    stock: 10,
    ...overrides,
  });

  const createProduct = async (overrides: Record<string, unknown> = {}) =>
    (await api().post('/api/v1/admin/products').set(auth).send(body(overrides)).expect(201))
      .body as AdminProductResponse;

  const list = async (query = '') =>
    (await api().get(`/api/v1/admin/products${query}`).set(auth).expect(200))
      .body as Paginated<AdminProductResponse>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    admin = await createUserWithToken(app, Role.ADMIN);
    customer = await createUserWithToken(app, Role.CUSTOMER);
    auth.Authorization = admin.bearer;
    categoryId = (await prisma.category.create({ data: { name: 'Electronics' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('create and read', () => {
    it('creates a product: 201, Location, money as a decimal string, no archive mark', async () => {
      const response = await api()
        .post('/api/v1/admin/products')
        .set(auth)
        .send(body({ price: '5' }))
        .expect(201);
      const product = response.body as AdminProductResponse;

      expect(response.headers.location).toBe(`/api/v1/admin/products/${product.id}`);
      expect(product).toMatchObject({
        name: 'Wireless Mouse',
        price: '5.00',
        stock: 10,
        inStock: true,
        imageUrl: null,
        category: { id: categoryId, name: 'Electronics' },
        deletedAt: null,
      });
      const fetched = await api().get(response.headers.location).set(auth).expect(200);
      expect(fetched.body).toEqual(product);
    });

    it('marks a product without stock as not in stock', async () => {
      expect(await createProduct({ stock: 0 })).toMatchObject({ stock: 0, inStock: false });
    });

    it('keeps a price exact, with no floating-point drift', async () => {
      expect(await createProduct({ price: '0.10' })).toMatchObject({ price: '0.10' });
      expect(await createProduct({ price: '999999.99' })).toMatchObject({ price: '999999.99' });
    });

    it('answers 404 CATEGORY_NOT_FOUND when the category does not exist', async () => {
      const response = await api()
        .post('/api/v1/admin/products')
        .set(auth)
        .send(body({ categoryId: MISSING_ID }))
        .expect(404);

      expect(response.body).toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    });

    it('answers 400 VALIDATION_FAILED naming every bad field', async () => {
      const response = await api()
        .post('/api/v1/admin/products')
        .set(auth)
        .send(body({ price: '0', stock: -1, name: '' }))
        .expect(400);

      const fields = (response.body as { details: { field: string }[] }).details
        .map((d) => d.field)
        .sort();
      expect(fields).toEqual(['name', 'price', 'stock']);
    });

    it('answers 404 PRODUCT_NOT_FOUND for an unknown id and 400 for a malformed one', async () => {
      const missing = await api().get(`/api/v1/admin/products/${MISSING_ID}`).set(auth).expect(404);
      await api().get('/api/v1/admin/products/not-a-uuid').set(auth).expect(400);

      expect(missing.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });
  });

  describe('update', () => {
    it('changes the editable fields and clears the image with null', async () => {
      const other = await prisma.category.create({ data: { name: 'Office' } });
      const product = await createProduct({ imageUrl: 'https://cdn.example.com/a.png' });

      const response = await api()
        .patch(`/api/v1/admin/products/${product.id}`)
        .set(auth)
        .send({
          name: 'Ergo Mouse',
          price: '30.50',
          description: 'New',
          categoryId: other.id,
          imageUrl: null,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Ergo Mouse',
        price: '30.50',
        description: 'New',
        imageUrl: null,
        category: { id: other.id, name: 'Office' },
      });
    });

    it('cannot change stock: the field is rejected and stock stays as it was', async () => {
      const product = await createProduct({ stock: 10 });

      const response = await api()
        .patch(`/api/v1/admin/products/${product.id}`)
        .set(auth)
        .send({ stock: 999 })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(
        10,
      );
    });

    it('rejects a null name, an unknown category and an unknown product', async () => {
      const product = await createProduct();

      await api()
        .patch(`/api/v1/admin/products/${product.id}`)
        .set(auth)
        .send({ name: null })
        .expect(400);
      const noCategory = await api()
        .patch(`/api/v1/admin/products/${product.id}`)
        .set(auth)
        .send({ categoryId: MISSING_ID })
        .expect(404);
      const noProduct = await api()
        .patch(`/api/v1/admin/products/${MISSING_ID}`)
        .set(auth)
        .send({ name: 'X' })
        .expect(404);

      expect(noCategory.body).toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
      expect(noProduct.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });
  });

  describe('archive and restore', () => {
    it('archives instead of deleting: the row and its data survive', async () => {
      const product = await createProduct();

      await api().delete(`/api/v1/admin/products/${product.id}`).set(auth).expect(204);

      const fetched = await api().get(`/api/v1/admin/products/${product.id}`).set(auth).expect(200);
      expect((fetched.body as AdminProductResponse).deletedAt).toEqual(expect.any(String));
      expect(await prisma.product.count()).toBe(1);
    });

    it('is idempotent, and 404 for an unknown product', async () => {
      const product = await createProduct();
      await api().delete(`/api/v1/admin/products/${product.id}`).set(auth).expect(204);

      await api().delete(`/api/v1/admin/products/${product.id}`).set(auth).expect(204);
      await api().delete(`/api/v1/admin/products/${MISSING_ID}`).set(auth).expect(404);
    });

    it('restores an archived product', async () => {
      const product = await createProduct();
      await api().delete(`/api/v1/admin/products/${product.id}`).set(auth).expect(204);

      const restored = await api()
        .post(`/api/v1/admin/products/${product.id}/restore`)
        .set(auth)
        .expect(200);

      expect(restored.body).toMatchObject({ id: product.id, deletedAt: null });
      await api().post(`/api/v1/admin/products/${MISSING_ID}/restore`).set(auth).expect(404);
    });
  });

  describe('list', () => {
    it('paginates newest first with a total order and reports the meta', async () => {
      for (const name of ['A', 'B', 'C', 'D', 'E']) await createProduct({ name });

      const first = await list('?limit=2&page=1');
      const second = await list('?limit=2&page=2');
      const third = await list('?limit=2&page=3');

      expect(first.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
      const names = [...first.items, ...second.items, ...third.items].map((p) => p.name);
      expect(names).toEqual(['E', 'D', 'C', 'B', 'A']);
      expect(third.items).toHaveLength(1);
    });

    it('filters by status: archived products are included only when asked for', async () => {
      const live = await createProduct({ name: 'Live' });
      const gone = await createProduct({ name: 'Gone' });
      await api().delete(`/api/v1/admin/products/${gone.id}`).set(auth).expect(204);

      expect((await list()).items.map((p) => p.id).sort()).toEqual([live.id, gone.id].sort());
      expect((await list('?status=active')).items.map((p) => p.id)).toEqual([live.id]);
      expect((await list('?status=archived')).items.map((p) => p.id)).toEqual([gone.id]);
    });

    it('filters by category', async () => {
      const other = await prisma.category.create({ data: { name: 'Office' } });
      await createProduct({ name: 'In electronics' });
      const inOffice = await createProduct({ name: 'In office', categoryId: other.id });

      expect((await list(`?categoryId=${other.id}`)).items.map((p) => p.id)).toEqual([inOffice.id]);
    });

    it('searches by name, ignoring case', async () => {
      await createProduct({ name: 'Wireless Mouse' });
      await createProduct({ name: 'Keyboard' });

      expect((await list('?search=MOUSE')).items.map((p) => p.name)).toEqual(['Wireless Mouse']);
    });

    it('treats % and _ in the search as literal characters, not wildcards', async () => {
      await createProduct({ name: '100% Cotton Shirt' });
      await createProduct({ name: '100 Cotton Shirt' });
      await createProduct({ name: 'Cable_Tie' });
      await createProduct({ name: 'Cable Tie' });

      expect((await list('?search=100%25')).items.map((p) => p.name)).toEqual([
        '100% Cotton Shirt',
      ]);
      expect((await list('?search=Cable_')).items.map((p) => p.name)).toEqual(['Cable_Tie']);
    });

    it.each([
      '?limit=101',
      '?limit=0',
      '?page=0',
      '?status=deleted',
      '?sort=price',
      '?categoryId=x',
    ])('rejects the query %s with 400', async (query) => {
      await api().get(`/api/v1/admin/products${query}`).set(auth).expect(400);
    });
  });

  describe('stock adjustments', () => {
    const adjust = (id: string, payload: Record<string, unknown>) =>
      api().post(`/api/v1/admin/products/${id}/stock-adjustments`).set(auth).send(payload);

    it('adds and removes units and reports the new stock', async () => {
      const product = await createProduct({ stock: 10 });

      const added = await adjust(product.id, { delta: 5, reason: 'delivery' }).expect(200);
      const removed = await adjust(product.id, { delta: -12 }).expect(200);

      expect(added.body).toEqual({ id: product.id, stock: 15 });
      expect(removed.body).toEqual({ id: product.id, stock: 3 });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(3);
    });

    it('refuses to go below zero with 409 INSUFFICIENT_STOCK and leaves stock untouched', async () => {
      const product = await createProduct({ stock: 3 });

      const response = await adjust(product.id, { delta: -4 }).expect(409);

      expect(response.body).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        details: [{ productId: product.id, requested: -4, available: 3 }],
      });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(3);
    });

    it('allows taking stock down to exactly zero', async () => {
      const product = await createProduct({ stock: 3 });

      expect((await adjust(product.id, { delta: -3 }).expect(200)).body).toEqual({
        id: product.id,
        stock: 0,
      });
    });

    it('fills stock up to exactly 1 000 000 and refuses to go past it with 400 on delta', async () => {
      const product = await createProduct({ stock: 999_990 });
      await adjust(product.id, { delta: 10 }).expect(200);

      const response = await adjust(product.id, { delta: 1 }).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [
          { field: 'delta', messages: ['Stock cannot go above 1000000 (current stock: 1000000)'] },
        ],
      });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(
        1_000_000,
      );
    });

    it('still takes units away when cancelled orders have put stock above the limit', async () => {
      const product = await createProduct();
      // Restocking a cancelled order is not capped (InventoryRepository.restock).
      await prisma.product.update({ where: { id: product.id }, data: { stock: 1_000_005 } });

      expect((await adjust(product.id, { delta: -1 }).expect(200)).body).toEqual({
        id: product.id,
        stock: 1_000_004,
      });
      await adjust(product.id, { delta: 1 }).expect(400);
    });

    it('refuses an archived product with 409 PRODUCT_UNAVAILABLE', async () => {
      const product = await createProduct();
      await api().delete(`/api/v1/admin/products/${product.id}`).set(auth).expect(204);

      expect((await adjust(product.id, { delta: 1 }).expect(409)).body).toMatchObject({
        code: 'PRODUCT_UNAVAILABLE',
      });
    });

    it('answers 404 for an unknown product and 400 for a zero or fractional delta', async () => {
      const product = await createProduct();

      await adjust(MISSING_ID, { delta: 1 }).expect(404);
      await adjust(product.id, { delta: 0 }).expect(400);
      await adjust(product.id, { delta: 1.5 }).expect(400);
      await adjust(product.id, {}).expect(400);
    });

    it('applies 20 simultaneous +1/-1 adjustments exactly: none lost, none applied twice', async () => {
      const product = await createProduct({ stock: 10 });
      const deltas = [
        ...Array.from({ length: 10 }, () => 1),
        ...Array.from({ length: 10 }, () => -1),
      ];

      const responses = await Promise.all(deltas.map((delta) => adjust(product.id, { delta })));

      expect(responses.map((r) => r.status)).toEqual(deltas.map(() => 200));
      expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(
        10,
      );
    });

    it('never oversells: 20 simultaneous -1 against stock 5 succeed exactly 5 times', async () => {
      const product = await createProduct({ stock: 5 });

      const responses = await Promise.all(
        Array.from({ length: 20 }, () => adjust(product.id, { delta: -1 })),
      );

      const statuses = responses.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(5);
      expect(statuses.filter((s) => s === 409)).toHaveLength(15);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(0);
    });
  });

  describe('access control', () => {
    const routes: [string, string][] = [
      ['get', '/api/v1/admin/products'],
      ['get', `/api/v1/admin/products/${MISSING_ID}`],
      ['post', '/api/v1/admin/products'],
      ['patch', `/api/v1/admin/products/${MISSING_ID}`],
      ['delete', `/api/v1/admin/products/${MISSING_ID}`],
      ['post', `/api/v1/admin/products/${MISSING_ID}/restore`],
      ['post', `/api/v1/admin/products/${MISSING_ID}/stock-adjustments`],
      ['post', '/api/v1/admin/products/images'],
    ];
    const call = (method: string, path: string) =>
      (api() as unknown as Record<string, (p: string) => request.Test>)[method](path);

    it.each(routes)('forbids a customer on %s %s', async (method, path) => {
      const response = await call(method, path)
        .set('Authorization', customer.bearer)
        .send({})
        .expect(403);

      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it.each(routes)('requires a token on %s %s', async (method, path) => {
      await call(method, path).send({}).expect(401);
    });
  });
});
