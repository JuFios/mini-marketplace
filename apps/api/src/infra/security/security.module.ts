import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from '../../modules/auth/auth.controller';
import { AuthModule } from '../../modules/auth/auth.module';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import type { Redis } from 'ioredis';

// Recognised by its handler, not by its URL: Express matches paths case-insensitively and with or
// without a trailing slash, so `/auth/login/` and `/AUTH/LOGIN` reach the same handler, and a
// comparison of paths would let them skip the per-email limit.
const isLogin = (context: ExecutionContext): boolean =>
  context.getHandler() === AuthController.prototype.login;

/**
 * Rate limiting and access control. The three global guards are listed here, in one array, because
 * their order matters: throttle first (so floods of unauthenticated requests are cut off before any
 * token work), then authentication, then roles.
 */
@Module({
  imports: [
    AuthModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        storage: new RedisThrottlerStorage(redis),
        throttlers: [
          // Every route: 100 requests per minute per IP (routes override it with @Throttle).
          { name: 'default', ttl: 60_000, limit: 100 },
          // Login only: 5 attempts per minute for one IP + email pair, so a password cannot be
          // guessed against a single account even from several addresses' worth of budget.
          {
            name: 'login-identity',
            ttl: 60_000,
            limit: 5,
            skipIf: (context) => !isLogin(context),
            getTracker: (req) => {
              const { email } = (req.body ?? {}) as { email?: unknown };
              const identity = typeof email === 'string' ? email.trim().toLowerCase() : '';
              return `${String(req.ip)}|${identity}`;
            },
          },
        ],
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class SecurityModule {}
