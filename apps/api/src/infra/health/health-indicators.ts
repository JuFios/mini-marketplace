import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { withTimeout } from '../../common/utils/with-timeout';

const PING_TIMEOUT_MS = 3_000;

// The health endpoint is public: it reports which dependency is down, never why. The real
// error goes to the log.
const UNREACHABLE = { message: 'unreachable' };

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(DatabaseHealthIndicator.name) private readonly logger: PinoLogger,
  ) {}

  async check(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check(key);
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, PING_TIMEOUT_MS);
      return indicator.up();
    } catch (error) {
      this.logger.error({ err: error }, 'Database health check failed');
      return indicator.down(UNREACHABLE);
    }
  }
}

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectPinoLogger(RedisHealthIndicator.name) private readonly logger: PinoLogger,
  ) {}

  async check(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check(key);
    try {
      await withTimeout(this.redis.ping(), PING_TIMEOUT_MS);
      return indicator.up();
    } catch (error) {
      this.logger.error({ err: error }, 'Redis health check failed');
      return indicator.down(UNREACHABLE);
    }
  }
}
