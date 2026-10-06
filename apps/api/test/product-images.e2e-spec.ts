import { INestApplication } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { Role } from '../src/generated/prisma/client';
import { AppConfigService } from '../src/config/app-config.service';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('pretend-this-is-pixel-data'),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);

describe('product image upload (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  let customer: TestUser;
  let uploadDir: string;

  const api = () => request(httpServer(app));
  const upload = (content: Buffer, filename = 'photo.png', contentType = 'image/png') =>
    api()
      .post('/api/v1/admin/products/images')
      .set('Authorization', admin.bearer)
      .attach('file', content, { filename, contentType });

  beforeAll(async () => {
    app = await createTestApp();
    uploadDir = resolve(app.get(AppConfigService).uploadDir);
  });

  beforeEach(async () => {
    await resetDb(app);
    admin = await createUserWithToken(app, Role.ADMIN);
    customer = await createUserWithToken(app, Role.CUSTOMER);
  });

  afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
    await app.close();
  });

  it.each([
    ['PNG', PNG, 'png', 'image/png'],
    ['JPEG', JPEG, 'jpg', 'image/jpeg'],
    ['WebP', WEBP, 'webp', 'image/webp'],
  ])(
    'stores a %s under a generated name and serves it publicly',
    async (_label, content, extension, mime) => {
      const response = await upload(content).expect(201);
      const { url } = response.body as { url: string };

      expect(url).toMatch(new RegExp(`^/uploads/[0-9a-f-]{36}\\.${extension}$`));
      const served = await api().get(url).expect(200);
      expect(served.headers['content-type']).toBe(mime);
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.headers['cache-control']).toMatch(/immutable/);
      expect(Buffer.from(served.body as Buffer).equals(content)).toBe(true);
    },
  );

  it('names the file by its content, ignoring the name the client chose', async () => {
    const response = await upload(PNG, '../../etc/passwd.txt', 'text/plain').expect(201);

    expect((response.body as { url: string }).url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
  });

  it('can be used as the image of a product', async () => {
    const { url } = (await upload(PNG).expect(201)).body as { url: string };

    const created = await api()
      .post('/api/v1/admin/categories')
      .set('Authorization', admin.bearer)
      .send({ name: 'Cat' })
      .expect(201);
    const product = await api()
      .post('/api/v1/admin/products')
      .set('Authorization', admin.bearer)
      .send({
        name: 'P',
        description: '',
        price: '1.00',
        stock: 1,
        categoryId: (created.body as { id: string }).id,
        imageUrl: url,
      })
      .expect(201);

    expect(product.body).toMatchObject({ imageUrl: url });
  });

  it('rejects text pretending to be a PNG with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const response = await upload(
      Buffer.from('<script>alert(1)</script>'),
      'evil.png',
      'image/png',
    ).expect(415);

    expect(response.body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it.each([
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg', 'image/svg+xml'],
    ['a GIF', Buffer.from('GIF89a'), 'a.gif', 'image/gif'],
    ['an empty file', Buffer.alloc(0), 'a.png', 'image/png'],
  ])('rejects %s', async (_label, content, filename, contentType) => {
    await upload(content, filename, contentType).expect(415);
  });

  it('rejects a file over the size limit with 413 PAYLOAD_TOO_LARGE', async () => {
    const limit = app.get(AppConfigService).uploadMaxBytes;
    const tooBig = Buffer.concat([PNG, Buffer.alloc(limit)]);

    const response = await upload(tooBig).expect(413);

    expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('accepts a file exactly at the limit', async () => {
    const limit = app.get(AppConfigService).uploadMaxBytes;
    const atLimit = Buffer.concat([PNG, Buffer.alloc(limit - PNG.length)]);

    await upload(atLimit).expect(201);
  });

  it('answers 400 when no file is attached or the field has the wrong name', async () => {
    const none = await api()
      .post('/api/v1/admin/products/images')
      .set('Authorization', admin.bearer)
      .field('x', 'y')
      .expect(400);
    const wrongField = await api()
      .post('/api/v1/admin/products/images')
      .set('Authorization', admin.bearer)
      .attach('picture', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(400);

    expect(none.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(wrongField.body).toMatchObject({ statusCode: 400 });
  });

  it('forbids a customer', async () => {
    await api()
      .post('/api/v1/admin/products/images')
      .set('Authorization', customer.bearer)
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(403);
  });

  it('does not serve anything outside the uploads directory', async () => {
    await api().get('/uploads/../package.json').expect(404);
    await api().get('/uploads/%2e%2e/package.json').expect(404);
  });
});
