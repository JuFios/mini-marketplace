import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { OrderProcessingService } from '../order-processing.service';
import {
  ORDERS_QUEUE,
  PROCESS_ORDER_JOB,
  ProcessOrderJob,
  SWEEP_STALE_ORDERS_JOB,
  WORKER_CONCURRENCY,
} from './order-queue.constants';
import { StaleOrderSweeper } from './stale-order.sweeper';

/** The worker's entry point: routes each job of the `orders` queue to the code that handles it. */
@Processor(ORDERS_QUEUE, { concurrency: WORKER_CONCURRENCY })
export class OrderProcessingProcessor extends WorkerHost {
  constructor(
    private readonly processing: OrderProcessingService,
    private readonly sweeper: StaleOrderSweeper,
    private readonly logger: PinoLogger,
  ) {
    super();
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(OrderProcessingProcessor.name);
  }

  async process(job: Job<ProcessOrderJob>): Promise<void> {
    switch (job.name) {
      case PROCESS_ORDER_JOB:
        await this.processing.process(job.data.orderId);
        return;
      case SWEEP_STALE_ORDERS_JOB:
        await this.sweeper.sweep();
        return;
      default:
        // No retry would ever make an unknown job known.
        throw new UnrecoverableError(`Unknown job "${job.name}"`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ProcessOrderJob> | undefined, error: Error): void {
    // `attemptsMade` counts this attempt; the job is retried until `attempts` is used up.
    this.logger.warn(
      {
        event: 'order.processing_failed',
        jobName: job?.name,
        orderId: job?.data.orderId,
        attempt: job?.attemptsMade,
        attempts: job?.opts.attempts,
        err: error,
      },
      'Processing job failed',
    );
  }
}
