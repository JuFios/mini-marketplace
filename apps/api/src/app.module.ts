import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './infra/health/health.module';
import { AppLoggerModule } from './infra/logger/logger.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    CommonModule,
    PrismaModule,
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}
