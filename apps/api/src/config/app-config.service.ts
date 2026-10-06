import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

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
}
