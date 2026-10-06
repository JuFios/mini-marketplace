import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { REDIS_CLIENT } from '../src/infra/redis/redis.module';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

describe('GET /api/v1/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the database and Redis as up', async () => {
    const response = await request(httpServer(app)).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('returns a generated X-Request-Id', async () => {
    const response = await request(httpServer(app)).get('/api/v1/health').expect(200);

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed client X-Request-Id and replaces a malformed one', async () => {
    const echoed = await request(httpServer(app))
      .get('/api/v1/health')
      .set('X-Request-Id', 'trace-42');
    const replaced = await request(httpServer(app))
      .get('/api/v1/health')
      .set('X-Request-Id', 'not valid!');

    expect(echoed.headers['x-request-id']).toBe('trace-42');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers', async () => {
    const response = await request(httpServer(app)).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('GET /api/v1/health when Redis is unreachable (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // A real client aimed at a closed port, so the failure path is the production one.
    const unreachable = new Redis({
      host: '127.0.0.1',
      port: 1,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    unreachable.on('error', () => undefined);

    app = await createTestApp((builder) =>
      builder.overrideProvider(REDIS_CLIENT).useValue(unreachable),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 in the standard envelope and names the failing dependency only', async () => {
    const response = await request(httpServer(app)).get('/api/v1/health').expect(503);

    expect(response.body).toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      details: {
        status: 'error',
        info: { database: { status: 'up' } },
        error: { redis: { status: 'down', message: 'unreachable' } },
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);
  });
});
