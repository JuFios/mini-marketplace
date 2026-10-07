import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { OnModuleInit } from '@nestjs/common';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { ExpiredTokenSweeper } from './expired-token.sweeper';
import {
  SWEEP_EXPIRED_TOKENS_EVERY_MS,
  SWEEP_EXPIRED_TOKENS_JOB,
  SWEEP_EXPIRED_TOKENS_SCHEDULER_ID,
  TOKEN_CLEANUP_QUEUE,
} from './token-cleanup.constants';

/**
 * The worker's entry point for the `token-cleanup` queue: schedules the recurring sweep and runs it.
 * One attempt per run: a failed sweep is not retried, the next scheduled one does the same work.
 */
@Processor(TOKEN_CLEANUP_QUEUE)
export class TokenCleanupProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly sweeper: ExpiredTokenSweeper,
    @InjectQueue(TOKEN_CLEANUP_QUEUE) private readonly queue: Queue,
    private readonly logger: PinoLogger,
  ) {
    super();
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(TokenCleanupProcessor.name);
  }

  /** Registers the recurring sweep; upserting makes any number of workers share one schedule. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SWEEP_EXPIRED_TOKENS_SCHEDULER_ID,
      { every: SWEEP_EXPIRED_TOKENS_EVERY_MS },
      {
        name: SWEEP_EXPIRED_TOKENS_JOB,
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: { count: 20 } },
      },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SWEEP_EXPIRED_TOKENS_JOB) {
      // No retry would ever make an unknown job known.
      throw new UnrecoverableError(`Unknown job "${job.name}"`);
    }
    await this.sweeper.sweep();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.warn(
      { event: 'tokens.sweep_failed', jobName: job?.name, err: error },
      'Token cleanup job failed',
    );
  }

  /** An error of the worker itself, logged rather than left to BullMQ's console.error. */
  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.warn({ event: 'tokens.worker_error', err: error }, 'Token cleanup worker error');
  }
}
