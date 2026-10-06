import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ErrorResponseBody } from '../src/common/filters/all-exceptions.filter';
import { createTestApp, httpServer } from './helpers/create-test-app';

describe('error envelope (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown route with the standard envelope and a matching request id', async () => {
    const response = await request(httpServer(app)).get('/api/v1/does-not-exist').expect(404);
    const body = response.body as ErrorResponseBody;

    expect(body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      requestId: response.headers['x-request-id'],
      path: '/api/v1/does-not-exist',
    });
    expect(typeof body.message).toBe('string');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('uses the request id sent by the client', async () => {
    const response = await request(httpServer(app))
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', 'trace-7')
      .expect(404);

    expect(response.body).toMatchObject({ requestId: 'trace-7' });
  });

  it('answers a route outside the API prefix in the same envelope', async () => {
    const response = await request(httpServer(app)).get('/health').expect(404);

    expect(response.body).toMatchObject({ code: 'NOT_FOUND', path: '/health' });
  });

  it('answers malformed JSON with 400 VALIDATION_FAILED and still carries a request id', async () => {
    const response = await request(httpServer(app))
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    const body = response.body as ErrorResponseBody;

    expect(body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('answers an oversized body with 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(httpServer(app))
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ filler: 'x'.repeat(200_000) }))
      .expect(413);

    expect(response.body).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  });
});

describe('API documentation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves Swagger UI', async () => {
    const response = await request(httpServer(app)).get('/api/docs').expect(200);

    expect(response.text).toContain('swagger-ui');
  });

  it('serves the OpenAPI document with prefixed paths', async () => {
    const response = await request(httpServer(app)).get('/api/docs-json').expect(200);
    const document = response.body as { paths: Record<string, unknown> };

    expect(Object.keys(document.paths)).toContain('/api/v1/health');
  });
});
