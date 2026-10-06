import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../config/app-config.service';
import { REDIS_CLIENT } from '../../infra/redis/redis.module';

export const CATALOG_VERSION_KEY = 'catalog:version';

/**
 * Versioned cache-aside for the public catalog.
 *
 * Every key lives under `catalog:v{n}:` where `n` is a counter in Redis. A catalog write bumps the
 * counter (`invalidate`), which makes every older key unreachable at once, with no scanning and no
 * per-key bookkeeping; the orphans simply expire by TTL.
 *
 * Why stale data cannot outlive an invalidation: a reader reads the version BEFORE it reads the
 * database, and a writer bumps it AFTER its transaction commits. A reader that loaded old data
 * therefore holds a version from before the bump, writes into the old namespace, and nobody reads
 * that namespace any more.
 *
 * Redis is an optimisation, never a dependency: every failure falls through to the database.
 */
@Injectable()
export class CatalogCacheService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(CatalogCacheService.name);
  }

  /** Returns the cached value for `keySuffix`, or runs `load` and caches its result. */
  async remember<T>(keySuffix: string, load: () => Promise<T>): Promise<T> {
    const version = await this.readVersion();
    if (version === null) return load();

    const key = `catalog:v${version}:${keySuffix}`;
    const cached = await this.read<T>(key);
    if (cached !== undefined) return cached;

    // An error thrown by `load` (a 404, say) propagates and is never cached.
    const value = await load();
    await this.write(key, value);
    return value;
  }

  /** Call after the database transaction of a catalog change has committed. */
  async invalidate(): Promise<void> {
    try {
      await this.redis.incr(CATALOG_VERSION_KEY);
    } catch (error) {
      // Staleness is then bounded by the TTL.
      this.logger.warn({ err: error }, 'Catalog cache invalidation failed');
    }
  }

  private async readVersion(): Promise<number | null> {
    try {
      return Number((await this.redis.get(CATALOG_VERSION_KEY)) ?? 0);
    } catch (error) {
      this.logger.warn({ err: error }, 'Catalog cache unavailable, reading from the database');
      return null;
    }
  }

  /** `undefined` means "not usable": a miss, an error or an unreadable entry. */
  private async read<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.redis.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (error) {
      this.logger.warn({ err: error }, 'Catalog cache read failed');
      return undefined;
    }
  }

  private async write(key: string, value: unknown): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', this.config.catalogCacheTtlSeconds);
    } catch (error) {
      this.logger.warn({ err: error }, 'Catalog cache write failed');
    }
  }
}
