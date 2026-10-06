import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import type { Paginated } from '../src/common/pagination/pagination.dto';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/infra/redis/redis.module';
import type { ProductResponse } from '../src/modules/products/dto/product.response.dto';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

describe('catalog cache (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let admin: TestUser;
  let categoryId: string;
  let productId: string;

  const api = () => request(httpServer(app));
  const keys = async (): Promise<string[]> => (await redis.keys('catalog:*')).sort();
  const item = async () =>
    (await api().get(`/api/v1/products/${productId}`)).body as ProductResponse;
  const list = async () => (await api().get('/api/v1/products')).body as Paginated<ProductResponse>;
  const asAdmin = (): { Authorization: string } => ({ Authorization: admin.bearer });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  beforeEach(async () => {
    await resetDb(app);
    admin = await createUserWithToken(app, Role.ADMIN);
    categoryId = (await prisma.category.create({ data: { name: 'Mice' } })).id;
    productId = (
      await prisma.product.create({
        data: { name: 'Mouse', description: '', price: '10.00', stock: 5, categoryId },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('caching', () => {
    it('stores list, item and categories responses with a TTL', async () => {
      await list();
      await item();
      await api().get('/api/v1/categories').expect(200);

      const stored = await keys();
      expect(stored).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^catalog:v0:products:list:[0-9a-f]{40}$/),
          `catalog:v0:products:item:${productId}`,
          'catalog:v0:categories',
        ]),
      );
      const ttl = await redis.ttl(`catalog:v0:products:item:${productId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(120);
    });

    it('serves the second read from the cache: a change made behind its back is not visible', async () => {
      await item();
      await prisma.product.update({ where: { id: productId }, data: { price: '99.00' } });

      expect((await item()).price).toBe('10.00');
    });

    it('lets equivalent queries share one entry', async () => {
      await api().get('/api/v1/products').expect(200);
      await api().get('/api/v1/products?page=1&limit=20&sort=newest&inStock=false').expect(200);

      const listKeys = (await keys()).filter((key) => key.includes(':products:list:'));
      expect(listKeys).toHaveLength(1);
    });

    it('never caches a 404', async () => {
      await api().get('/api/v1/products/00000000-0000-4000-8000-000000000000').expect(404);

      expect((await keys()).filter((key) => key.includes(':products:item:'))).toEqual([]);
    });
  });

  describe('invalidation', () => {
    it('shows an admin price change on the very next public read, in the item and the list', async () => {
      await item();
      await list();

      await api()
        .patch(`/api/v1/admin/products/${productId}`)
        .set(asAdmin())
        .send({ price: '12.50' })
        .expect(200);

      expect((await item()).price).toBe('12.50');
      expect((await list()).items[0].price).toBe('12.50');
    });

    it('removes an archived product from the list at once, and brings it back on restore', async () => {
      expect((await list()).items).toHaveLength(1);
      await item();

      await api().delete(`/api/v1/admin/products/${productId}`).set(asAdmin()).expect(204);
      expect((await list()).items).toHaveLength(0);
      await api().get(`/api/v1/products/${productId}`).expect(404);

      await api().post(`/api/v1/admin/products/${productId}/restore`).set(asAdmin()).expect(200);
      expect((await list()).items).toHaveLength(1);
      await api().get(`/api/v1/products/${productId}`).expect(200);
    });

    it('shows a stock adjustment immediately', async () => {
      expect(await item()).toMatchObject({ stock: 5, inStock: true });

      await api()
        .post(`/api/v1/admin/products/${productId}/stock-adjustments`)
        .set(asAdmin())
        .send({ delta: -5 })
        .expect(200);

      expect(await item()).toMatchObject({ stock: 0, inStock: false });
    });

    it('shows a new product in the list', async () => {
      await list();

      await api()
        .post('/api/v1/admin/products')
        .set(asAdmin())
        .send({ name: 'Keyboard', description: '', price: '40.00', stock: 1, categoryId })
        .expect(201);

      expect((await list()).meta.total).toBe(2);
    });

    it('refreshes categories and the category name embedded in cached products', async () => {
      await api().get('/api/v1/categories').expect(200);
      await item();

      await api()
        .patch(`/api/v1/admin/categories/${categoryId}`)
        .set(asAdmin())
        .send({ name: 'Pointing' })
        .expect(200);
      const created = await api()
        .post('/api/v1/admin/categories')
        .set(asAdmin())
        .send({ name: 'Audio' })
        .expect(201);

      const categories = (await api().get('/api/v1/categories').expect(200)).body as {
        name: string;
      }[];
      expect(categories.map((c) => c.name)).toEqual(['Audio', 'Pointing']);
      expect((await item()).category.name).toBe('Pointing');

      await api()
        .delete(`/api/v1/admin/categories/${(created.body as { id: string }).id}`)
        .set(asAdmin())
        .expect(204);
      expect(((await api().get('/api/v1/categories')).body as unknown[]).length).toBe(1);
    });

    it('does not bump the version when a write is rejected', async () => {
      await api()
        .patch(`/api/v1/admin/products/${productId}`)
        .set(asAdmin())
        .send({ price: '0' })
        .expect(400);
      await api()
        .delete('/api/v1/admin/categories/00000000-0000-4000-8000-000000000000')
        .set(asAdmin())
        .expect(404);

      expect(await redis.get('catalog:version')).toBeNull();
    });
  });

  describe('when Redis is unreachable', () => {
    let degraded: INestApplication;

    beforeAll(async () => {
      const unreachable = new Redis({
        host: '127.0.0.1',
        port: 1,
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      unreachable.on('error', () => undefined);
      degraded = await createTestApp((builder) =>
        builder.overrideProvider(REDIS_CLIENT).useValue(unreachable),
      );
    });

    afterAll(async () => {
      await degraded.close();
    });

    it('still serves the catalog from the database and still accepts admin writes', async () => {
      const server = () => request(httpServer(degraded));

      const products = await server().get('/api/v1/products').expect(200);
      await server().get(`/api/v1/products/${productId}`).expect(200);
      await server().get('/api/v1/categories').expect(200);
      await server()
        .patch(`/api/v1/admin/products/${productId}`)
        .set('Authorization', admin.bearer)
        .send({ price: '11.00' })
        .expect(200);

      expect((products.body as Paginated<ProductResponse>).items).toHaveLength(1);
      expect(
        ((await server().get(`/api/v1/products/${productId}`)).body as ProductResponse).price,
      ).toBe('11.00');
    });
  });
});
