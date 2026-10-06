import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { redisOptionsFromUrl } from './redis-options';

/**
 * The Redis connection every BullMQ queue and worker of the process is built from. Imported once
 * per process, by the API and by the worker, which share the queues but not the process.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: redisOptionsFromUrl(config.redisUrl),
      }),
    }),
  ],
})
export class QueueModule {}
