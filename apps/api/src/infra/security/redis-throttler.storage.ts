import { Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { Redis } from 'ioredis';

/** Counts requests per key in Redis, so limits hold across several API instances. */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger('Throttler');

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    try {
      // One atomic transaction. `NX` sets the expiry only when the key has none, so the window
      // starts at the first hit and is not extended by later ones; INCR + PEXPIRE can never
      // leave a counter behind that never expires.
      const results = await this.redis
        .multi()
        .incr(redisKey)
        .pexpire(redisKey, ttl, 'NX')
        .pttl(redisKey)
        .exec();
      if (!results) throw new Error('Redis transaction was discarded');
      for (const [error] of results) if (error) throw error;

      const totalHits = Number(results[0][1]);
      const remainingSeconds = Math.max(1, Math.ceil(Number(results[2][1]) / 1000));
      const isBlocked = totalHits > limit;
      return {
        totalHits,
        timeToExpire: remainingSeconds,
        isBlocked,
        timeToBlockExpire: isBlocked ? remainingSeconds : 0,
      };
    } catch (error) {
      // Fail open: a Redis outage must not take login and checkout down with it.
      this.logger.warn(`Rate limiting skipped, Redis unavailable: ${String(error)}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
