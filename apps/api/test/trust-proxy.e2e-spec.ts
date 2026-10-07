import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppConfigService } from '../src/config/app-config.service';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

// The login limiter allows 5 attempts a minute per client address and email. What counts as the
// client address depends on TRUST_PROXY, which is read when the application boots.
const ATTEMPTS = 5;

// The setting is read once, while the application boots. The configuration is loaded when the
// modules are first imported, so the value is replaced at the accessor for the time of the boot.
async function appBehind(hops: number | undefined): Promise<INestApplication> {
  if (hops === undefined) return createTestApp();
  const spy = jest.spyOn(AppConfigService.prototype, 'trustProxyHops', 'get').mockReturnValue(hops);
  try {
    return await createTestApp();
  } finally {
    spy.mockRestore();
  }
}

const loginFrom = (app: INestApplication, forwardedFor: string, email: string) =>
  request(httpServer(app))
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', forwardedFor)
    .send({ email, password: 'wrong-pass1' });

describe('client address behind a reverse proxy (e2e)', () => {
  describe('without a proxy in front (TRUST_PROXY unset)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await appBehind(undefined);
    });
    beforeEach(async () => {
      await resetDb(app);
    });
    afterAll(async () => {
      await app.close();
    });

    it('ignores X-Forwarded-For, so a forged header cannot buy a fresh login budget', async () => {
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        await loginFrom(app, `203.0.113.${attempt}`, 'ann@example.com').expect(401);
      }

      await loginFrom(app, '203.0.113.99', 'ann@example.com').expect(429);
    });
  });

  describe('behind one proxy (TRUST_PROXY=1)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await appBehind(1);
    });
    beforeEach(async () => {
      await resetDb(app);
    });
    afterAll(async () => {
      await app.close();
    });

    it('gives every forwarded client its own login budget', async () => {
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        await loginFrom(app, '203.0.113.1', 'ann@example.com').expect(401);
      }

      // The first client is blocked, a second one behind the same proxy is not.
      await loginFrom(app, '203.0.113.1', 'ann@example.com').expect(429);
      await loginFrom(app, '203.0.113.2', 'ann@example.com').expect(401);
    });

    it('trusts only the proxy’s own entry: a client-supplied prefix is not the client', async () => {
      // With one hop the right-most address is the one the proxy saw; the rest was sent by the
      // client and may say anything.
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        await loginFrom(app, `198.51.100.${attempt}, 203.0.113.7`, 'ann@example.com').expect(401);
      }

      await loginFrom(app, '198.51.100.99, 203.0.113.7', 'ann@example.com').expect(429);
    });
  });
});
