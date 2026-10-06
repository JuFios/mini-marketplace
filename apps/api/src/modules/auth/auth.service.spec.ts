import { JwtService } from '@nestjs/jwt';
import type { PinoLogger } from 'nestjs-pino';
import type { AppConfigService } from '../../config/app-config.service';
import { Role, User } from '../../generated/prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import type { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenService } from './token.service';

const USER: User = {
  id: 'user-1',
  email: 'ann@example.com',
  name: 'Ann',
  passwordHash: 'stored-hash',
  role: Role.CUSTOMER,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeConfig(refreshTtl = 604_800): AppConfigService {
  return {
    jwtAccessSecret: 'a'.repeat(32),
    jwtRefreshSecret: 'b'.repeat(32),
    jwtAccessTtlSeconds: 900,
    jwtRefreshTtlSeconds: refreshTtl,
  } as AppConfigService;
}

function setup() {
  const config = makeConfig();
  const tokens = new TokenService(new JwtService(), config);
  const refreshTokens = {
    create: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(),
    revokeIfActive: jest.fn(),
    revokeFamily: jest.fn().mockResolvedValue(1),
  };
  const users = {
    create: jest.fn().mockResolvedValue(USER),
    findByEmail: jest.fn(),
    findById: jest.fn().mockResolvedValue(USER),
  };
  const passwords = {
    hash: jest.fn().mockResolvedValue('new-hash'),
    verify: jest.fn(),
    verifyAgainstNothing: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), setContext: jest.fn() };
  const transaction = jest.fn((work: (tx: object) => Promise<unknown>) => work({}));
  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    tokens,
    refreshTokens as unknown as RefreshTokensRepository,
    { $transaction: transaction } as unknown as PrismaService,
    config,
    logger as unknown as PinoLogger,
  );
  return { service, tokens, refreshTokens, users, passwords, logger, transaction };
}

describe('AuthService', () => {
  describe('register', () => {
    it('creates a customer with a hashed password and starts a session', async () => {
      const { service, users, passwords, refreshTokens } = setup();

      const session = await service.register({
        email: 'ann@example.com',
        password: 'secret123',
        name: 'Ann',
      });

      expect(passwords.hash).toHaveBeenCalledWith('secret123');
      expect(users.create).toHaveBeenCalledWith({
        email: 'ann@example.com',
        name: 'Ann',
        passwordHash: 'new-hash',
        role: Role.CUSTOMER,
      });
      expect(refreshTokens.create).toHaveBeenCalledTimes(1);
      expect(session.accessToken).toEqual(expect.any(String));
      expect(session.expiresIn).toBe(900);
    });
  });

  describe('login', () => {
    it('answers an unknown email exactly like a wrong password, after a dummy verification', async () => {
      const { service, users, passwords } = setup();
      users.findByEmail.mockResolvedValue(null);
      const unknown = await service
        .login({ email: 'x@example.com', password: 'whatever1' })
        .catch((e: unknown) => e);

      users.findByEmail.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(false);
      const wrong = await service
        .login({ email: USER.email, password: 'whatever1' })
        .catch((e: unknown) => e);

      expect(passwords.verifyAgainstNothing).toHaveBeenCalledWith('whatever1');
      expect(unknown).toMatchObject({ httpStatus: 401, code: 'INVALID_CREDENTIALS' });
      expect(wrong).toMatchObject({ httpStatus: 401, code: 'INVALID_CREDENTIALS' });
      expect((unknown as Error).message).toBe((wrong as Error).message);
    });

    it('starts a session for correct credentials', async () => {
      const { service, users, passwords } = setup();
      users.findByEmail.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(true);

      const session = await service.login({ email: USER.email, password: 'secret123' });

      expect(session.user).toBe(USER);
      expect(session.refreshToken).toEqual(expect.any(String));
    });
  });

  describe('refresh', () => {
    async function validRefreshToken(ctx: ReturnType<typeof setup>): Promise<string> {
      ctx.users.findByEmail.mockResolvedValue(USER);
      ctx.passwords.verify.mockResolvedValue(true);
      return (await ctx.service.login({ email: USER.email, password: 'secret123' })).refreshToken;
    }

    it('consumes the presented token and issues a new pair in the same family, in one transaction', async () => {
      const ctx = setup();
      const presented = await validRefreshToken(ctx);
      const before = ctx.tokens.verifyRefresh(presented);
      ctx.refreshTokens.revokeIfActive.mockResolvedValue(true);

      const session = await ctx.service.refresh(presented);

      const after = ctx.tokens.verifyRefresh(session.refreshToken);
      expect(after.fam).toBe(before.fam);
      expect(after.jti).not.toBe(before.jti);
      expect(ctx.refreshTokens.revokeIfActive).toHaveBeenCalledWith(
        before.jti,
        expect.any(Date),
        expect.anything(),
      );
      expect(ctx.transaction).toHaveBeenCalledTimes(1);
      expect(ctx.refreshTokens.revokeFamily).not.toHaveBeenCalled();
      expect(ctx.tokens.verifyAccess(session.accessToken)).toEqual({
        id: USER.id,
        role: Role.CUSTOMER,
      });
    });

    it('treats a reused token as theft: revokes the whole family and answers 401', async () => {
      const ctx = setup();
      const presented = await validRefreshToken(ctx);
      const claims = ctx.tokens.verifyRefresh(presented);
      ctx.refreshTokens.revokeIfActive.mockResolvedValue(false);
      ctx.refreshTokens.findById.mockResolvedValue({
        id: claims.jti,
        userId: USER.id,
        familyId: claims.fam,
        revokedAt: new Date(),
      });

      await expect(ctx.service.refresh(presented)).rejects.toMatchObject({
        httpStatus: 401,
        code: 'REFRESH_TOKEN_INVALID',
      });

      expect(ctx.refreshTokens.revokeFamily).toHaveBeenCalledWith(claims.fam, expect.any(Date));
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth.refresh_reuse_detected', familyId: claims.fam }),
        expect.any(String),
      );
    });

    it('rejects a token whose JWT has expired without touching the database', async () => {
      const ctx = setup();
      const expired = new TokenService(new JwtService(), makeConfig(-10)).signRefresh({
        sub: USER.id,
        jti: 'jti-1',
        fam: 'fam-1',
      });

      await expect(ctx.service.refresh(expired)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });

      expect(ctx.refreshTokens.revokeIfActive).not.toHaveBeenCalled();
    });

    it('rejects a token that is unknown or expired in the database without revoking anything', async () => {
      const ctx = setup();
      const presented = await validRefreshToken(ctx);
      ctx.refreshTokens.revokeIfActive.mockResolvedValue(false);
      ctx.refreshTokens.findById.mockResolvedValue(null);

      await expect(ctx.service.refresh(presented)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });

      expect(ctx.refreshTokens.revokeFamily).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing cookie', undefined],
      ['garbage', 'not-a-jwt'],
    ])('rejects %s', async (_label, value) => {
      const ctx = setup();

      await expect(ctx.service.refresh(value)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });
    });

    it('does not accept an access token as a refresh token', async () => {
      const ctx = setup();
      const access = ctx.tokens.signAccess({ id: USER.id, role: Role.CUSTOMER });

      await expect(ctx.service.refresh(access)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });
    });
  });

  describe('logout', () => {
    it('revokes the session behind the cookie, even an expired one', async () => {
      const ctx = setup();
      const expired = new TokenService(new JwtService(), makeConfig(-10)).signRefresh({
        sub: USER.id,
        jti: 'jti-1',
        fam: 'fam-1',
      });

      await ctx.service.logout(expired);

      expect(ctx.refreshTokens.revokeFamily).toHaveBeenCalledWith('fam-1', expect.any(Date));
    });

    it.each([
      ['no cookie', undefined],
      ['a broken cookie', 'garbage'],
    ])('is a silent no-op with %s', async (_label, value) => {
      const ctx = setup();

      await expect(ctx.service.logout(value)).resolves.toBeUndefined();

      expect(ctx.refreshTokens.revokeFamily).not.toHaveBeenCalled();
    });
  });
});
