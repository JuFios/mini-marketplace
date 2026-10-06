import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { withTimeout } from '../../../common/utils/with-timeout';
import type { OrderEventsPublisher } from '../order-events.publisher';
import {
  ENQUEUE_TIMEOUT_MS,
  ORDERS_QUEUE,
  PROCESS_ORDER_JOB,
  PROCESS_ORDER_OPTIONS,
  ProcessOrderJob,
} from './order-queue.constants';

/**
 * Hands a committed order to the queue. Called after the checkout transaction, which treats a
 * failure here as non-fatal: the order exists as NEW and the stale-order sweeper enqueues it
 * later. That is also why the wait is bounded: Redis being down must not hold up the response.
 */
@Injectable()
export class OrderProcessingProducer implements OrderEventsPublisher {
  constructor(@InjectQueue(ORDERS_QUEUE) private readonly queue: Queue<ProcessOrderJob>) {}

  async orderCreated(orderId: string): Promise<void> {
    // The job id is the order id: while a job for the order exists, adding another is a no-op,
    // so an order cannot be queued twice.
    await withTimeout(
      this.queue.add(PROCESS_ORDER_JOB, { orderId }, { ...PROCESS_ORDER_OPTIONS, jobId: orderId }),
      ENQUEUE_TIMEOUT_MS,
    );
  }
}
