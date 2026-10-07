import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { OnModuleInit } from '@nestjs/common';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  IMAGE_CLEANUP_QUEUE,
  SWEEP_ORPHAN_IMAGES_EVERY_MS,
  SWEEP_ORPHAN_IMAGES_JOB,
  SWEEP_ORPHAN_IMAGES_SCHEDULER_ID,
} from './image-cleanup.constants';
import { OrphanImageSweeper } from './orphan-image.sweeper';

/**
 * The worker's entry point for the `image-cleanup` queue: schedules the recurring sweep and runs it.
 * One attempt per run: a failed sweep is not retried, the next scheduled one does the same work.
 */
@Processor(IMAGE_CLEANUP_QUEUE)
export class ImageCleanupProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly sweeper: OrphanImageSweeper,
    @InjectQueue(IMAGE_CLEANUP_QUEUE) private readonly queue: Queue,
    private readonly logger: PinoLogger,
  ) {
    super();
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(ImageCleanupProcessor.name);
  }

  /** Registers the recurring sweep; upserting makes any number of workers share one schedule. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SWEEP_ORPHAN_IMAGES_SCHEDULER_ID,
      { every: SWEEP_ORPHAN_IMAGES_EVERY_MS },
      {
        name: SWEEP_ORPHAN_IMAGES_JOB,
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: { count: 20 } },
      },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SWEEP_ORPHAN_IMAGES_JOB) {
      // No retry would ever make an unknown job known.
      throw new UnrecoverableError(`Unknown job "${job.name}"`);
    }
    await this.sweeper.sweep();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.warn(
      { event: 'images.sweep_failed', jobName: job?.name, err: error },
      'Image cleanup job failed',
    );
  }

  /** An error of the worker itself, logged rather than left to BullMQ's console.error. */
  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.warn({ event: 'images.worker_error', err: error }, 'Image cleanup worker error');
  }
}
