import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let customer: TestUser;

  const api = () => request(httpServer(app));
  const asAdmin = { Authorization: '' };

  const createCategory = async (name: string) =>
    (
      await api()
        .post('/api/v1/admin/categories')
        .set('Authorization', admin.bearer)
        .send({ name })
        .expect(201)
    ).body as { id: string; name: string; productCount: number };

  const addProduct = (categoryId: string, name: string, deletedAt: Date | null = null) =>
    prisma.product.create({
      data: { name, description: '', price: '1.00', stock: 1, categoryId, deletedAt },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    admin = await createUserWithToken(app, Role.ADMIN);
    customer = await createUserWithToken(app, Role.CUSTOMER);
    asAdmin.Authorization = admin.bearer;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('public list', () => {
    it('is readable without a token, sorted by name, counting only live products', async () => {
      const books = await createCategory('Books');
      const toys = await createCategory('Toys');
      await addProduct(books.id, 'Live 1');
      await addProduct(books.id, 'Live 2');
      await addProduct(books.id, 'Archived', new Date());
      await addProduct(toys.id, 'Only archived', new Date());

      const response = await api().get('/api/v1/categories').expect(200);

      expect(response.body).toEqual([
        { id: books.id, name: 'Books', productCount: 2 },
        { id: toys.id, name: 'Toys', productCount: 0 },
      ]);
    });

    it('is an empty array when there are no categories', async () => {
      const response = await api().get('/api/v1/categories').expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('create and rename', () => {
    it('creates a category with a trimmed name', async () => {
      const response = await api()
        .post('/api/v1/admin/categories')
        .set(asAdmin)
        .send({ name: '  Garden  ' })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'Garden', productCount: 0 });
    });

    it('rejects a duplicate name with 409 CATEGORY_NAME_TAKEN', async () => {
      await createCategory('Books');

      const response = await api()
        .post('/api/v1/admin/categories')
        .set(asAdmin)
        .send({ name: 'Books' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });
    });

    it('renames a category, and refuses a name that is taken', async () => {
      const books = await createCategory('Books');
      await createCategory('Toys');

      const renamed = await api()
        .patch(`/api/v1/admin/categories/${books.id}`)
        .set(asAdmin)
        .send({ name: 'Novels' })
        .expect(200);
      const clash = await api()
        .patch(`/api/v1/admin/categories/${books.id}`)
        .set(asAdmin)
        .send({ name: 'Toys' })
        .expect(409);

      expect(renamed.body).toMatchObject({ id: books.id, name: 'Novels' });
      expect(clash.body).toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });
    });

    it('answers 404 CATEGORY_NOT_FOUND when renaming or deleting an unknown category', async () => {
      const renamed = await api()
        .patch(`/api/v1/admin/categories/${MISSING_ID}`)
        .set(asAdmin)
        .send({ name: 'X' })
        .expect(404);
      const deleted = await api()
        .delete(`/api/v1/admin/categories/${MISSING_ID}`)
        .set(asAdmin)
        .expect(404);

      expect(renamed.body).toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
      expect(deleted.body).toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    });

    it.each([
      ['an empty name', { name: '' }],
      ['a name over 100 characters', { name: 'x'.repeat(101) }],
      ['an unknown field', { name: 'Ok', color: 'red' }],
    ])('rejects %s with 400', async (_label, body) => {
      await api().post('/api/v1/admin/categories').set(asAdmin).send(body).expect(400);
    });

    it('rejects a malformed id with 400', async () => {
      await api()
        .patch('/api/v1/admin/categories/not-a-uuid')
        .set(asAdmin)
        .send({ name: 'X' })
        .expect(400);
    });
  });

  describe('delete', () => {
    it('deletes an empty category', async () => {
      const books = await createCategory('Books');

      await api().delete(`/api/v1/admin/categories/${books.id}`).set(asAdmin).expect(204);

      expect((await api().get('/api/v1/categories')).body).toEqual([]);
    });

    it('refuses to delete a category that has a live product', async () => {
      const books = await createCategory('Books');
      await addProduct(books.id, 'Live');

      const response = await api()
        .delete(`/api/v1/admin/categories/${books.id}`)
        .set(asAdmin)
        .expect(409);

      expect(response.body).toMatchObject({ code: 'CATEGORY_IN_USE' });
    });

    it('refuses to delete a category that only has archived products (history references them)', async () => {
      const books = await createCategory('Books');
      await addProduct(books.id, 'Archived', new Date());

      const response = await api()
        .delete(`/api/v1/admin/categories/${books.id}`)
        .set(asAdmin)
        .expect(409);

      expect(response.body).toMatchObject({ code: 'CATEGORY_IN_USE' });
    });
  });

  describe('access control', () => {
    const routes: [string, string][] = [
      ['post', '/api/v1/admin/categories'],
      ['patch', `/api/v1/admin/categories/${MISSING_ID}`],
      ['delete', `/api/v1/admin/categories/${MISSING_ID}`],
    ];

    it.each(routes)('forbids a customer on %s %s', async (method, path) => {
      const call = (api() as unknown as Record<string, (p: string) => request.Test>)[method](path);

      const response = await call
        .set('Authorization', customer.bearer)
        .send({ name: 'X' })
        .expect(403);

      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it.each(routes)('requires a token on %s %s', async (method, path) => {
      const call = (api() as unknown as Record<string, (p: string) => request.Test>)[method](path);

      await call.send({ name: 'X' }).expect(401);
    });
  });
});
