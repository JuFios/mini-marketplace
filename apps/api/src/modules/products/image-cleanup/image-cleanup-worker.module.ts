import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ProductsRepository } from '../products.repository';
import { IMAGE_CLEANUP_QUEUE } from './image-cleanup.constants';
import { ImageCleanupProcessor } from './image-cleanup.processor';
import { OrphanImageSweeper } from './orphan-image.sweeper';

/**
 * Everything that consumes the `image-cleanup` queue. Only the worker process loads it: the API
 * never adds a job to this queue, the recurring sweep is scheduled by the worker itself. The
 * worker needs the uploads directory the API writes to (the same volume) to find anything.
 */
@Module({
  imports: [BullModule.registerQueue({ name: IMAGE_CLEANUP_QUEUE })],
  providers: [ProductsRepository, OrphanImageSweeper, ImageCleanupProcessor],
})
export class ImageCleanupWorkerModule {}
