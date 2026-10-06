import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator, RedisHealthIndicator } from './health-indicators';

@Module({
  // `json` keeps failed checks machine-readable in the log stream.
  imports: [TerminusModule.forRoot({ errorLogStyle: 'json' })],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
