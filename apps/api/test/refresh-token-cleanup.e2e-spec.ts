import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RefreshTokensRepository } from '../src/modules/auth/refresh-tokens.repository';
import { ExpiredTokenSweeper } from '../src/modules/auth/token-cleanup/expired-token.sweeper';
import {
  EXPIRED_TOKEN_GRACE_MS,
  SWEEP_BATCH_SIZE,
} from '../src/modules/auth/token-cleanup/token-cleanup.constants';
import { refreshCookieOf, register } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

const HOUR = 60 * 60_000;

describe('expired refresh token cleanup (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sweeper: ExpiredTokenSweeper;

  const refresh = (cookie: string) =>
    request(httpServer(app)).post('/api/v1/auth/refresh').set('Cookie', cookie);
  const ago = (ms: number) => new Date(Date.now() - ms);
  const fromNow = (ms: number) => new Date(Date.now() + ms);
  const row = (userId: string, expiresAt: Date, revokedAt: Date | null = null) => ({
    id: randomUUID(),
    userId,
    familyId: randomUUID(),
    expiresAt,
    revokedAt,
  });
  const remainingIds = async () =>
    (await prisma.refreshToken.findMany({ select: { id: true } })).map(({ id }) => id).sort();

  beforeAll(async () => {
    app = await createTestApp(undefined, [], {
      providers: [RefreshTokensRepository, ExpiredTokenSweeper],
    });
    prisma = app.get(PrismaService);
    sweeper = app.get(ExpiredTokenSweeper);
  });

  beforeEach(async () => {
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('deletes tokens that expired before the grace period and keeps every other row', async () => {
    const { body } = await register(app);
    const [issued] = await remainingIds();
    const userId = body.user.id;
    const kept = [
      row(userId, ago(EXPIRED_TOKEN_GRACE_MS / 2)),
      row(userId, fromNow(24 * HOUR), ago(HOUR)),
    ];
    const gone = [
      row(userId, ago(EXPIRED_TOKEN_GRACE_MS + HOUR)),
      row(userId, ago(EXPIRED_TOKEN_GRACE_MS + HOUR), ago(3 * 24 * HOUR)),
    ];
    await prisma.refreshToken.createMany({ data: [...kept, ...gone] });

    await expect(sweeper.sweep()).resolves.toBe(gone.length);

    expect(await remainingIds()).toEqual([issued, ...kept.map(({ id }) => id)].sort());
  });

  it('keeps the row of a rotated token, so replaying it still revokes the session', async () => {
    const { cookie: first } = await register(app);
    const second = refreshCookieOf(await refresh(first).expect(200));

    await expect(sweeper.sweep()).resolves.toBe(0);

    await refresh(first).expect(401);
    await refresh(second).expect(401);
    const tokens = await prisma.refreshToken.findMany();
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('works through a backlog larger than one batch', async () => {
    const { body } = await register(app);
    const backlog = 2 * SWEEP_BATCH_SIZE + 5;
    await prisma.refreshToken.createMany({
      data: Array.from({ length: backlog }, () =>
        row(body.user.id, ago(EXPIRED_TOKEN_GRACE_MS + HOUR)),
      ),
    });

    await expect(sweeper.sweep()).resolves.toBe(backlog);

    expect(await prisma.refreshToken.count()).toBe(1);
  });
});
