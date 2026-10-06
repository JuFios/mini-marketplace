import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * One shared connection for cache and rate-limit counters. Queue workers open their own
 * connections: blocking commands must not share a socket with request-path commands.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis(config.redisUrl, {
          // Cache paths fail open, so a command against an unreachable Redis has to fail fast
          // instead of waiting in the offline queue through ioredis' default 20 retries.
          maxRetriesPerRequest: 1,
          connectTimeout: 5_000,
          retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
        });
        // Without a listener, an 'error' event would crash the process.
        client.on('error', (error: Error) => {
          logger.warn(`Redis connection error: ${error.message}`);
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    // QUIT needs a live connection; with Redis down it would wait for a reply that never comes.
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else if (this.redis.status !== 'end') {
      // Not for an already ended client: its socket is gone, so ioredis' force-close timer
      // would never be cancelled and would delay process exit by two seconds.
      this.redis.disconnect();
    }
  }
}
