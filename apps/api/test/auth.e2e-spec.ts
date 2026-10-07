import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ErrorResponseBody } from '../src/common/filters/all-exceptions.filter';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { Roles } from '../src/modules/auth/decorators/roles.decorator';
import type { AuthResponse } from '../src/modules/auth/dto/auth.response.dto';
import type { UserResponse } from '../src/modules/users/dto/user.response.dto';
import {
  createAdmin,
  PASSWORD,
  refreshCookieOf,
  register,
  setCookies,
} from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

// A route that exists only in this suite, to exercise the role guard.
@Roles(Role.ADMIN)
@Controller('test-only/admin')
class AdminProbeController {
  @Get()
  probe(): { ok: true } {
    return { ok: true };
  }
}

const bearer = (token: string): string => `Bearer ${token}`;

describe('authentication (e2e)', () => {
  let app: INestApplication;

  const api = () => request(httpServer(app));
  const login = (email: string, password: string) =>
    api().post('/api/v1/auth/login').send({ email, password });
  const refresh = (cookie: string) => api().post('/api/v1/auth/refresh').set('Cookie', cookie);

  beforeAll(async () => {
    app = await createTestApp(undefined, [AdminProbeController]);
  });

  beforeEach(async () => {
    // Also flushes Redis, so rate-limit counters start from zero in every test.
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register', () => {
    it('creates a customer, returns a session and the profile is readable with the token', async () => {
      const { body, response } = await register(app);

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        user: { email: 'ann@example.com', name: 'Ann', role: 'CUSTOMER' },
        expiresIn: 900,
      });
      expect(body.accessToken).toEqual(expect.any(String));
      expect(JSON.stringify(body)).not.toMatch(/password/i);

      const me = await api()
        .get('/api/v1/users/me')
        .set('Authorization', bearer(body.accessToken))
        .expect(200);
      expect(me.body).toEqual(body.user);
    });

    it('sets the refresh cookie as HttpOnly, SameSite=Strict and scoped to the auth routes', async () => {
      const { response } = await register(app);

      const cookie = setCookies(response).find((c) => c.startsWith('refresh_token='));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth(;|$)/);
      expect(cookie).toMatch(/Max-Age=604800/);
    });

    it('stores a hash, never the password, and always creates a customer', async () => {
      await register(app);

      const user = await app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { email: 'ann@example.com' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.role).toBe(Role.CUSTOMER);
    });

    it('rejects a duplicate email regardless of case with 409 EMAIL_ALREADY_REGISTERED', async () => {
      await register(app, 'ann@example.com');

      const response = await api()
        .post('/api/v1/auth/register')
        .send({ email: 'ANN@Example.com', password: PASSWORD, name: 'Other' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    });

    it.each([
      ['a weak password', { password: 'short' }, 'password'],
      ['an attempt to register as admin', { role: 'ADMIN' }, 'role'],
      ['an invalid email', { email: 'nope' }, 'email'],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_label, override, field) => {
      const response = await api()
        .post('/api/v1/auth/register')
        .send({ email: 'ann@example.com', password: PASSWORD, name: 'Ann', ...override })
        .expect(400);

      const body = response.body as ErrorResponseBody;
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });
  });

  describe('login', () => {
    it('logs in with the right credentials, ignoring email case', async () => {
      await register(app);

      const response = await login('ANN@example.com', PASSWORD).expect(200);

      expect((response.body as AuthResponse).user.email).toBe('ann@example.com');
      expect(refreshCookieOf(response)).toMatch(/^refresh_token=/);
    });

    it('answers a wrong password and an unknown email identically', async () => {
      await register(app);

      const wrong = await login('ann@example.com', 'wrong-pass1').expect(401);
      const unknown = await login('nobody@example.com', 'wrong-pass1').expect(401);

      const strip = ({ requestId: _r, timestamp: _t, ...rest }: ErrorResponseBody) => rest;
      expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(strip(unknown.body as ErrorResponseBody)).toEqual(
        strip(wrong.body as ErrorResponseBody),
      );
    });

    it('limits attempts per IP and email: the 6th in a minute is 429, even with the right password', async () => {
      await register(app);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await login('ann@example.com', 'wrong-pass1').expect(401);
      }

      const blocked = await login('ann@example.com', PASSWORD).expect(429);

      expect(blocked.body).toMatchObject({ statusCode: 429, code: 'TOO_MANY_REQUESTS' });
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('counts every spelling of the login path towards that limit: trailing slash, letter case', async () => {
      await register(app);
      // Express routes all of these to the login handler.
      const spellings = ['/api/v1/auth/login/', '/API/V1/AUTH/LOGIN', '/api/v1/Auth/Login/'];
      for (let attempt = 0; attempt < 5; attempt++) {
        await api()
          .post(spellings[attempt % spellings.length])
          .send({ email: 'ann@example.com', password: 'wrong-pass1' })
          .expect(401);
      }

      await api()
        .post('/api/v1/auth/login/')
        .send({ email: 'ann@example.com', password: PASSWORD })
        .expect(429);
    });

    it('does not let one email exhaust the budget of another', async () => {
      await register(app);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await login('victim@example.com', 'wrong-pass1').expect(401);
      }

      await login('ann@example.com', PASSWORD).expect(200);
    });
  });

  describe('refresh and logout', () => {
    it('rotates the cookie and issues a working access token', async () => {
      const { cookie } = await register(app);

      const response = await refresh(cookie).expect(200);

      expect(refreshCookieOf(response)).not.toBe(cookie);
      const { accessToken } = response.body as AuthResponse;
      await api().get('/api/v1/users/me').set('Authorization', bearer(accessToken)).expect(200);
    });

    it('treats a reused refresh token as theft: 401 and the rotated token dies too', async () => {
      const { cookie: first } = await register(app);
      const rotated = await refresh(first).expect(200);
      const second = refreshCookieOf(rotated);

      const replay = await refresh(first).expect(401);
      expect(replay.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });

      await refresh(second).expect(401);
      const tokens = await app.get(PrismaService).refreshToken.findMany();
      expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
    });

    it('lets only one of two simultaneous refreshes with the same token succeed', async () => {
      const { cookie } = await register(app);

      const statuses = (await Promise.all([refresh(cookie), refresh(cookie)])).map((r) => r.status);

      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 401)).toHaveLength(1);
    });

    it.each([
      ['no cookie', undefined],
      ['a garbage cookie', 'refresh_token=garbage'],
    ])('rejects refresh with %s', async (_label, cookie) => {
      const call = api().post('/api/v1/auth/refresh');
      const response = await (cookie ? call.set('Cookie', cookie) : call).expect(401);

      expect(response.body).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    });

    it('logout revokes the session and clears the cookie; refreshing afterwards fails', async () => {
      const { cookie } = await register(app);

      const response = await api().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);

      expect(setCookies(response).find((c) => c.startsWith('refresh_token='))).toMatch(
        /Expires=Thu, 01 Jan 1970/,
      );
      await refresh(cookie).expect(401);
    });

    it('logout without a session is still 204', async () => {
      await api().post('/api/v1/auth/logout').expect(204);
    });
  });

  describe('access control', () => {
    it('rejects a protected route without a token with 401 UNAUTHORIZED', async () => {
      const response = await api().get('/api/v1/users/me').expect(401);

      expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it.each([
      ['a malformed token', 'Bearer garbage'],
      ['a non-bearer scheme', 'Basic abc'],
    ])('rejects %s', async (_label, header) => {
      await api().get('/api/v1/users/me').set('Authorization', header).expect(401);
    });

    it('rejects a refresh token presented as an access token', async () => {
      const { cookie } = await register(app);

      await api()
        .get('/api/v1/users/me')
        .set('Authorization', bearer(cookie.split('=')[1]))
        .expect(401);
    });

    it('forbids a customer on an admin route and allows an admin', async () => {
      const customer = await register(app);
      await createAdmin(app);
      const admin = (await login('admin@example.com', PASSWORD).expect(200)).body as AuthResponse;

      const denied = await api()
        .get('/api/v1/test-only/admin')
        .set('Authorization', bearer(customer.body.accessToken))
        .expect(403);
      await api()
        .get('/api/v1/test-only/admin')
        .set('Authorization', bearer(admin.accessToken))
        .expect(200);

      expect(denied.body).toMatchObject({ code: 'FORBIDDEN' });
      expect(admin.user).toMatchObject({ role: 'ADMIN' } satisfies Partial<UserResponse>);
    });

    it('keeps the health endpoint public', async () => {
      await api().get('/api/v1/health').expect(200);
    });
  });
});
