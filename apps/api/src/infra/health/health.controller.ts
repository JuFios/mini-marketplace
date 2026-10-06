import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { ServiceUnavailableAppException } from '../../common/exceptions/app.exception';
import { Public } from '../../modules/auth/decorators/public.decorator';
import { DatabaseHealthIndicator, RedisHealthIndicator } from './health-indicators';

// Probed by orchestrators every few seconds: neither authenticated nor rate limited.
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Reports whether the database and Redis are reachable' })
  async check(): Promise<HealthCheckResult> {
    try {
      return await this.health.check([
        () => this.database.check('database'),
        () => this.redis.check('redis'),
      ]);
    } catch (error) {
      // Terminus signals a failed check with a 503 carrying its own body; re-throw it in the
      // standard error envelope, keeping the per-dependency result as `details`.
      if (error instanceof ServiceUnavailableException) {
        throw new ServiceUnavailableAppException(
          'A dependency is unavailable',
          error.getResponse(),
        );
      }
      throw error;
    }
  }
}
