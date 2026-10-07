import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/** How the JWT secrets published in `.env.example` and the compose file begin. */
export const PUBLISHED_SECRET_PREFIX = 'dev-only-';

/** The only way application code reads configuration; values are validated at boot. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get port(): Env['PORT'] {
    return this.config.get('PORT', { infer: true });
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get swaggerEnabled(): Env['SWAGGER_ENABLED'] {
    return this.config.get('SWAGGER_ENABLED', { infer: true });
  }

  get databaseUrl(): Env['DATABASE_URL'] {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): Env['REDIS_URL'] {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get jwtAccessSecret(): Env['JWT_ACCESS_SECRET'] {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtRefreshSecret(): Env['JWT_REFRESH_SECRET'] {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  /** True while either JWT secret is one of the published development values. */
  get usesPublishedDevSecrets(): boolean {
    return [this.jwtAccessSecret, this.jwtRefreshSecret].some((secret) =>
      secret.startsWith(PUBLISHED_SECRET_PREFIX),
    );
  }

  get jwtAccessTtlSeconds(): Env['JWT_ACCESS_TTL_SECONDS'] {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  get jwtRefreshTtlSeconds(): Env['JWT_REFRESH_TTL_SECONDS'] {
    return this.config.get('JWT_REFRESH_TTL_SECONDS', { infer: true });
  }

  get cookieSecure(): Env['COOKIE_SECURE'] {
    return this.config.get('COOKIE_SECURE', { infer: true });
  }

  get trustProxyHops(): Env['TRUST_PROXY'] {
    return this.config.get('TRUST_PROXY', { infer: true });
  }

  get uploadDir(): Env['UPLOAD_DIR'] {
    return this.config.get('UPLOAD_DIR', { infer: true });
  }

  get uploadMaxBytes(): Env['UPLOAD_MAX_BYTES'] {
    return this.config.get('UPLOAD_MAX_BYTES', { infer: true });
  }

  get catalogCacheTtlSeconds(): Env['CATALOG_CACHE_TTL_SECONDS'] {
    return this.config.get('CATALOG_CACHE_TTL_SECONDS', { infer: true });
  }

  get paymentMockFailureRate(): Env['PAYMENT_MOCK_FAILURE_RATE'] {
    return this.config.get('PAYMENT_MOCK_FAILURE_RATE', { infer: true });
  }

  get paymentMockDelayMs(): Env['PAYMENT_MOCK_DELAY_MS'] {
    return this.config.get('PAYMENT_MOCK_DELAY_MS', { infer: true });
  }
}
