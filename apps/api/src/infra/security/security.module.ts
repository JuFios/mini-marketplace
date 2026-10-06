import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { API_PREFIX } from '../../common/api-prefix';
import { AuthModule } from '../../modules/auth/auth.module';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import type { Redis } from 'ioredis';

const LOGIN_PATH = `/${API_PREFIX}/auth/login`;

const isLogin = (context: ExecutionContext): boolean =>
  context.switchToHttp().getRequest<Request>().path === LOGIN_PATH;

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
