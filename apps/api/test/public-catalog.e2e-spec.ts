import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Paginated } from '../src/common/pagination/pagination.dto';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import type { ProductResponse } from '../src/modules/products/dto/product.response.dto';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const at = (day: number): Date => new Date(Date.UTC(2026, 0, day));

describe('public catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryA: string;
  let categoryB: string;
  let ids: Record<'mouse' | 'wired' | 'keyboard' | 'monitor' | 'lamp', string>;

  const api = () => request(httpServer(app));
  const list = async (query = '') =>
    (await api().get(`/api/v1/products${query}`).expect(200)).body as Paginated<ProductResponse>;
  const names = (page: Paginated<ProductResponse>): string[] => page.items.map((p) => p.name);

  const product = (
    name: string,
    price: string,
    stock: number,
    categoryId: string,
    createdAt: Date,
    deletedAt: Date | null = null,
  ) =>
    prisma.product.create({
      data: { name, description: `About ${name}`, price, stock, categoryId, createdAt, deletedAt },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    categoryA = (await prisma.category.create({ data: { name: 'Mice' } })).id;
    categoryB = (await prisma.category.create({ data: { name: 'Desk' } })).id;
    const [mouse, wired, keyboard, monitor, lamp] = await Promise.all([
      product('Wireless Mouse', '25.00', 5, categoryA, at(1)),
      product('Wired Mouse', '15.00', 0, categoryA, at(2)),
      product('Keyboard', '80.00', 3, categoryB, at(3)),
      product('Monitor', '80.00', 1, categoryB, at(4)),
      product('Archived Lamp', '5.00', 9, categoryB, at(5), new Date()),
    ]);
    ids = {
      mouse: mouse.id,
      wired: wired.id,
      keyboard: keyboard.id,
      monitor: monitor.id,
      lamp: lamp.id,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  describe('list', () => {
    it('is public, newest first, and never shows archived products', async () => {
      const page = await list();

      expect(names(page)).toEqual(['Monitor', 'Keyboard', 'Wired Mouse', 'Wireless Mouse']);
      expect(page.meta).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
    });

    it('returns the customer-facing shape: money as a string, no archive mark', async () => {
      const [monitor] = (await list()).items;

      expect(monitor).toEqual({
        id: ids.monitor,
        name: 'Monitor',
        description: 'About Monitor',
        price: '80.00',
        stock: 1,
        inStock: true,
        imageUrl: null,
        category: { id: categoryB, name: 'Desk' },
        createdAt: at(4).toISOString(),
        updatedAt: expect.any(String) as string,
      });
      expect(monitor).not.toHaveProperty('deletedAt');
    });

    it('filters by category', async () => {
      expect(names(await list(`?categoryId=${categoryA}`))).toEqual([
        'Wired Mouse',
        'Wireless Mouse',
      ]);
    });

    it('filters by price range, inclusive at both ends', async () => {
      expect(names(await list('?minPrice=15&maxPrice=25'))).toEqual([
        'Wired Mouse',
        'Wireless Mouse',
      ]);
      expect(names(await list('?minPrice=80'))).toEqual(['Monitor', 'Keyboard']);
      expect(names(await list('?maxPrice=14.99'))).toEqual([]);
    });

    it('keeps only products in stock with inStock=true', async () => {
      expect(names(await list('?inStock=true'))).toEqual(['Monitor', 'Keyboard', 'Wireless Mouse']);
      expect(await list('?inStock=false')).toMatchObject({ meta: { total: 4 } });
    });

    it('searches the name case-insensitively', async () => {
      expect(names(await list('?search=MOUSE'))).toEqual(['Wired Mouse', 'Wireless Mouse']);
      expect(names(await list('?search=less'))).toEqual(['Wireless Mouse']);
    });

    it('treats % and _ in the search literally', async () => {
      await product('100% Cotton', '9.00', 1, categoryA, at(6));
      await product('100 Cotton', '9.00', 1, categoryA, at(7));

      expect(names(await list('?search=100%25'))).toEqual(['100% Cotton']);
      expect(names(await list('?search=%25'))).toEqual(['100% Cotton']);
    });

    it('combines filters', async () => {
      const page = await list(`?categoryId=${categoryA}&inStock=true&maxPrice=30&search=wireless`);

      expect(names(page)).toEqual(['Wireless Mouse']);
    });

    it('sorts by price ascending and descending, breaking ties by id', async () => {
      const tied = [ids.keyboard, ids.monitor].sort();

      const asc = await list('?sort=price_asc');
      const desc = await list('?sort=price_desc');

      expect(asc.items.map((p) => p.price)).toEqual(['15.00', '25.00', '80.00', '80.00']);
      expect(asc.items.slice(2).map((p) => p.id)).toEqual(tied);
      expect(desc.items.map((p) => p.price)).toEqual(['80.00', '80.00', '25.00', '15.00']);
      expect(desc.items.slice(0, 2).map((p) => p.id)).toEqual(tied);
    });

    it('paginates without overlap or gaps, even across equal prices', async () => {
      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        seen.push(...(await list(`?sort=price_asc&limit=2&page=${page}`)).items.map((p) => p.id));
      }

      expect(new Set(seen).size).toBe(4);
      expect((await list('?limit=2&page=2')).meta).toEqual({
        page: 2,
        limit: 2,
        total: 4,
        totalPages: 2,
      });
      expect((await list('?page=9')).items).toEqual([]);
    });

    it.each([
      ['minPrice above maxPrice', '?minPrice=50&maxPrice=10'],
      ['a negative minPrice', '?minPrice=-1'],
      ['a non-numeric maxPrice', '?maxPrice=cheap'],
      ['an unknown sort', '?sort=popularity'],
      ['an unknown parameter', '?colour=red'],
      ['a limit above 100', '?limit=101'],
      ['a malformed category id', '?categoryId=abc'],
      ['a malformed inStock', '?inStock=maybe'],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_label, query) => {
      const response = await api().get(`/api/v1/products${query}`).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('single product', () => {
    it('is public and returns the same shape as the list', async () => {
      const response = await api().get(`/api/v1/products/${ids.mouse}`).expect(200);

      expect(response.body).toMatchObject({
        id: ids.mouse,
        name: 'Wireless Mouse',
        price: '25.00',
      });
      expect(response.body).not.toHaveProperty('deletedAt');
    });

    it('answers 404 PRODUCT_NOT_FOUND for an archived product, an unknown id, and 400 for a malformed id', async () => {
      const archived = await api().get(`/api/v1/products/${ids.lamp}`).expect(404);
      const unknown = await api().get(`/api/v1/products/${MISSING_ID}`).expect(404);
      await api().get('/api/v1/products/not-a-uuid').expect(400);

      expect(archived.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      expect(unknown.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });
  });
});
