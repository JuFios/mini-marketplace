import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppConfigService } from '../src/config/app-config.service';
import { createTestApp, httpServer } from './helpers/create-test-app';

// COOKIE_SECURE is read while the application boots (see `configureApp`); the configuration is
// loaded when the modules are first imported, so the value is replaced at the accessor.
async function appServedOver(https: boolean | undefined): Promise<INestApplication> {
  if (https === undefined) return createTestApp();
  const spy = jest.spyOn(AppConfigService.prototype, 'cookieSecure', 'get').mockReturnValue(https);
  try {
    return await createTestApp();
  } finally {
    spy.mockRestore();
  }
}

const policyOf = async (app: INestApplication): Promise<string> => {
  const response = await request(httpServer(app)).get('/api/v1/health').expect(200);
  return String(response.headers['content-security-policy']);
};

describe('security headers (e2e)', () => {
  describe('API served over plain HTTP (the default)', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await appServedOver(undefined);
    });
    afterAll(async () => {
      await app.close();
    });

    it('does not tell browsers to upgrade to https, which nothing serves', async () => {
      expect(await policyOf(app)).not.toContain('upgrade-insecure-requests');
    });

    it('keeps the rest of the default policy', async () => {
      const policy = await policyOf(app);

      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("object-src 'none'");
    });

    it('sends the standard hardening headers and does not name the framework', async () => {
      const { headers } = await request(httpServer(app)).get('/api/v1/health').expect(200);

      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('API served over HTTPS (COOKIE_SECURE=true)', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await appServedOver(true);
    });
    afterAll(async () => {
      await app.close();
    });

    it('keeps helmet’s upgrade-insecure-requests', async () => {
      expect(await policyOf(app)).toContain('upgrade-insecure-requests');
    });
  });
});
