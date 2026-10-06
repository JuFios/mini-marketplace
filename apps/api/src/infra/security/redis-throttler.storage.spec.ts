import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler.storage';

function redisReturning(hits: number, pttl: number, error: Error | null = null): Redis {
  const chain = {
    incr: () => chain,
    pexpire: () => chain,
    pttl: () => chain,
    exec: () =>
      error
        ? Promise.reject(error)
        : Promise.resolve([
            [null, hits],
            [null, 1],
            [null, pttl],
          ]),
  };
  return { multi: () => chain } as unknown as Redis;
}

describe('RedisThrottlerStorage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports hits and the remaining window in seconds', async () => {
    const storage = new RedisThrottlerStorage(redisReturning(3, 41_200));

    const record = await storage.increment('k', 60_000, 5, 0, 'default');

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('blocks once the limit is exceeded, until the window ends', async () => {
    const storage = new RedisThrottlerStorage(redisReturning(6, 30_000));

    const record = await storage.increment('k', 60_000, 5, 0, 'default');

    expect(record).toMatchObject({ isBlocked: true, timeToBlockExpire: 30 });
  });

  it('allows the request when Redis is unavailable', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const storage = new RedisThrottlerStorage(redisReturning(0, 0, new Error('ECONNREFUSED')));

    const record = await storage.increment('k', 60_000, 5, 0, 'default');

    expect(record.isBlocked).toBe(false);
  });
});
