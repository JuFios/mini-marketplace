import { INestApplication } from '@nestjs/common';
import { readdir, rm, utimes } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { AppConfigService } from '../src/config/app-config.service';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { ORPHAN_IMAGE_MIN_AGE_MS } from '../src/modules/products/image-cleanup/image-cleanup.constants';
import { OrphanImageSweeper } from '../src/modules/products/image-cleanup/orphan-image.sweeper';
import { ProductsRepository } from '../src/modules/products/products.repository';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('pretend-this-is-pixel-data'),
]);
const OLD_ENOUGH = ORPHAN_IMAGE_MIN_AGE_MS + 60 * 60_000;

describe('unused product images (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sweeper: OrphanImageSweeper;
  let admin: TestUser;
  let categoryId: string;
  let uploadDir: string;

  const api = () => request(httpServer(app));
  const as = () => ({ Authorization: admin.bearer });

  const upload = async (): Promise<string> =>
    (
      (
        await api()
          .post('/api/v1/admin/products/images')
          .set(as())
          .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' })
          .expect(201)
      ).body as { url: string }
    ).url;
  const createProduct = async (name: string, imageUrl?: string): Promise<string> =>
    (
      (
        await api()
          .post('/api/v1/admin/products')
          .set(as())
          .send({ name, description: '', price: '9.99', categoryId, stock: 1, imageUrl })
          .expect(201)
      ).body as { id: string }
    ).id;
  const setImage = (productId: string, imageUrl: string | null) =>
    api().patch(`/api/v1/admin/products/${productId}`).set(as()).send({ imageUrl }).expect(200);

  const fileName = (url: string) => url.replace('/uploads/', '');
  const onDisk = async () => (await readdir(uploadDir)).sort();
  const age = async (url: string, ms: number) => {
    const moment = new Date(Date.now() - ms);
    await utimes(join(uploadDir, fileName(url)), moment, moment);
  };

  beforeAll(async () => {
    app = await createTestApp(undefined, [], {
      providers: [ProductsRepository, OrphanImageSweeper],
    });
    prisma = app.get(PrismaService);
    sweeper = app.get(OrphanImageSweeper);
    uploadDir = resolve(app.get(AppConfigService).uploadDir);
  });

  beforeEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
    await resetDb(app);
    admin = await createUserWithToken(app, Role.ADMIN);
    categoryId = (await prisma.category.create({ data: { name: 'Peripherals' } })).id;
  });

  afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
    await app.close();
  });

  it('removes the picture a product had before it was replaced, and keeps the new one', async () => {
    const before = await upload();
    const id = await createProduct('Mouse', before);
    const after = await upload();
    await setImage(id, after);
    await age(before, OLD_ENOUGH);
    await age(after, OLD_ENOUGH);

    const result = await sweeper.sweep();

    expect(result).toEqual({ deleted: 1, kept: 1, failed: 0 });
    expect(await onDisk()).toEqual([fileName(after)]);
    await api().get(before).expect(404);
    await api().get(after).expect(200);
  });

  it('removes the picture of a product whose picture was cleared', async () => {
    const picture = await upload();
    const id = await createProduct('Mouse', picture);
    await setImage(id, null);
    await age(picture, OLD_ENOUGH);

    await sweeper.sweep();

    expect(await onDisk()).toEqual([]);
  });

  it('removes a picture that was uploaded and never attached to a product', async () => {
    const abandoned = await upload();
    await age(abandoned, OLD_ENOUGH);

    expect(await sweeper.sweep()).toEqual({ deleted: 1, kept: 0, failed: 0 });
    expect(await onDisk()).toEqual([]);
  });

  it('keeps the picture of an archived product: restoring it needs the picture', async () => {
    const picture = await upload();
    const id = await createProduct('Mouse', picture);
    await api().delete(`/api/v1/admin/products/${id}`).set(as()).expect(204);
    await age(picture, OLD_ENOUGH);

    const result = await sweeper.sweep();

    expect(result).toEqual({ deleted: 0, kept: 1, failed: 0 });
    await api().post(`/api/v1/admin/products/${id}/restore`).set(as()).expect(200);
    await api().get(picture).expect(200);
  });

  it('keeps a picture uploaded a moment ago, which a form that is still open may be about to use', async () => {
    const fresh = await upload();
    const barely = await upload();
    await age(barely, ORPHAN_IMAGE_MIN_AGE_MS - 60_000);

    const result = await sweeper.sweep();

    expect(result).toEqual({ deleted: 0, kept: 0, failed: 0 });
    expect(await onDisk()).toEqual([fileName(fresh), fileName(barely)].sort());
  });

  it('does not touch products that link to a picture elsewhere', async () => {
    await createProduct('Mouse', 'https://cdn.example.com/mouse.png');
    const abandoned = await upload();
    await age(abandoned, OLD_ENOUGH);

    expect(await sweeper.sweep()).toEqual({ deleted: 1, kept: 0, failed: 0 });
    const [product] = await prisma.product.findMany();
    expect(product.imageUrl).toBe('https://cdn.example.com/mouse.png');
  });

  it('has nothing left to do on a second run', async () => {
    const abandoned = await upload();
    await age(abandoned, OLD_ENOUGH);
    await sweeper.sweep();

    expect(await sweeper.sweep()).toEqual({ deleted: 0, kept: 0, failed: 0 });
  });

  it('copes with an uploads directory that does not exist yet', async () => {
    expect(await sweeper.sweep()).toEqual({ deleted: 0, kept: 0, failed: 0 });
  });
});
