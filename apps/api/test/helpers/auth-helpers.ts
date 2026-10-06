import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request, { Response } from 'supertest';
import type { AuthResponse } from '../../src/modules/auth/dto/auth.response.dto';
import { Role } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { TokenService } from '../../src/modules/auth/token.service';
import { httpServer } from './create-test-app';

export const PASSWORD = 'secret123';

/** Raw `Set-Cookie` header values of a response. */
export function setCookies(response: Response): string[] {
  return (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

/** The refresh cookie as sent back by a browser: `name=value`, attributes stripped. */
export function refreshCookieOf(response: Response): string {
  const raw = setCookies(response).find((cookie) => cookie.startsWith('refresh_token='));
  if (!raw) throw new Error('Response did not set a refresh_token cookie');
  return raw.split(';')[0];
}

export async function register(
  app: INestApplication,
  email = 'ann@example.com',
): Promise<{ response: Response; body: AuthResponse; cookie: string }> {
  const response = await request(httpServer(app))
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, name: 'Ann' })
    .expect(201);
  return { response, body: response.body as AuthResponse, cookie: refreshCookieOf(response) };
}

export async function createAdmin(
  app: INestApplication,
  email = 'admin@example.com',
): Promise<void> {
  await app.get(PrismaService).user.create({
    data: {
      email,
      name: 'Admin',
      role: Role.ADMIN,
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
    },
  });
}

export interface TestUser {
  id: string;
  /** `Authorization` header value for this user. */
  bearer: string;
}

/**
 * Inserts a user and signs an access token for it directly, skipping the login endpoint: faster,
 * and it keeps tests that are not about authentication out of the login rate limits.
 */
export async function createUserWithToken(
  app: INestApplication,
  role: Role,
  email = `${role.toLowerCase()}@example.com`,
): Promise<TestUser> {
  const user = await app
    .get(PrismaService)
    .user.create({ data: { email, name: role, role, passwordHash: 'not-a-real-hash' } });
  const token = app.get(TokenService).signAccess({ id: user.id, role });
  return { id: user.id, bearer: `Bearer ${token}` };
}
