import type { PinoLogger } from 'nestjs-pino';
import type { AppConfigService } from '../../config/app-config.service';
import { CATALOG_VERSION_KEY, CatalogCacheService } from './catalog-cache.service';

function setup(overrides: Partial<Record<'get' | 'set' | 'incr', jest.Mock>> = {}) {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    incr: jest.fn((key: string) => {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));
      return Promise.resolve(next);
    }),
    ...overrides,
  };
  const logger = { warn: jest.fn(), setContext: jest.fn() };
  const config = { catalogCacheTtlSeconds: 120 } as AppConfigService;
  const cache = new CatalogCacheService(redis as never, config, logger as unknown as PinoLogger);
  return { cache, redis, store, logger };
}

describe('CatalogCacheService', () => {
  describe('remember', () => {
    it('loads on a miss, stores the value with the configured TTL and serves it afterwards', async () => {
      const { cache, redis } = setup();
      const load = jest.fn().mockResolvedValue({ price: '10.00' });

      const first = await cache.remember('products:item:1', load);
      const second = await cache.remember('products:item:1', load);

      expect(first).toEqual({ price: '10.00' });
      expect(second).toEqual({ price: '10.00' });
      expect(load).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(
        'catalog:v0:products:item:1',
        '{"price":"10.00"}',
        'EX',
        120,
      );
    });

    it('invalidation moves readers to a new namespace, so the old entry is never served again', async () => {
      const { cache } = setup();
      const load = jest.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
      await cache.remember('k', load);

      await cache.invalidate();
      const afterwards = await cache.remember('k', load);

      expect(afterwards).toBe('new');
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failure of the loader', async () => {
      const { cache, redis } = setup();

      await expect(cache.remember('k', () => Promise.reject(new Error('404')))).rejects.toThrow(
        '404',
      );

      expect(redis.set).not.toHaveBeenCalled();
    });

    it('fails open when Redis cannot be read at all: the loader result is returned', async () => {
      const { cache, logger } = setup({
        get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });

      await expect(cache.remember('k', () => Promise.resolve('from-db'))).resolves.toBe('from-db');

      expect(logger.warn).toHaveBeenCalled();
    });

    it('fails open when only the value read fails', async () => {
      const get = jest
        .fn()
        .mockResolvedValueOnce('0') // version
        .mockRejectedValueOnce(new Error('timeout'));
      const { cache } = setup({ get });

      await expect(cache.remember('k', () => Promise.resolve('from-db'))).resolves.toBe('from-db');
    });

    it('fails open when the write fails: the value is still returned', async () => {
      const { cache } = setup({ set: jest.fn().mockRejectedValue(new Error('OOM')) });

      await expect(cache.remember('k', () => Promise.resolve('from-db'))).resolves.toBe('from-db');
    });

    it('treats an unreadable cached entry as a miss', async () => {
      const { cache, store } = setup();
      store.set('catalog:v0:k', '{not json');

      await expect(cache.remember('k', () => Promise.resolve('from-db'))).resolves.toBe('from-db');
    });
  });

  describe('invalidate', () => {
    it('bumps the version counter', async () => {
      const { cache, store } = setup();

      await cache.invalidate();
      await cache.invalidate();

      expect(store.get(CATALOG_VERSION_KEY)).toBe('2');
    });

    it('never throws: a Redis failure only means staleness bounded by the TTL', async () => {
      const { cache, logger } = setup({ incr: jest.fn().mockRejectedValue(new Error('down')) });

      await expect(cache.invalidate()).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
