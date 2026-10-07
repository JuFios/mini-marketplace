import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { AppLoggerModule } from './infra/logger/logger.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { OrderWorkerModule } from './modules/orders/order-worker.module';
import { ImageCleanupWorkerModule } from './modules/products/image-cleanup/image-cleanup-worker.module';

/** The worker process: the same codebase as the API, without HTTP, auth or controllers. */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    OrderWorkerModule,
    ImageCleanupWorkerModule,
  ],
})
export class WorkerModule {}
