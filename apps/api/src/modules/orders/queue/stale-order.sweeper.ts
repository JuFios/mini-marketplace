import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { OrdersRepository } from '../orders.repository';
import {
  ORDERS_QUEUE,
  PROCESS_ORDER_JOB,
  PROCESS_ORDER_OPTIONS,
  ProcessOrderJob,
  STALE_AFTER_MS,
  SWEEP_BATCH_SIZE,
  SWEEP_EVERY_MS,
  SWEEP_SCHEDULER_ID,
  SWEEP_STALE_ORDERS_JOB,
} from './order-queue.constants';

export interface SweepResult {
  /** No job existed (the hand-over after checkout was lost): one was added. */
  enqueued: number;
  /** The job had failed for good: it was retried. */
  retried: number;
  /** The job had completed but the order is still NEW, which is a bug: it was replaced. */
  replaced: number;
  /** A job is already waiting, running or delayed. */
  skipped: number;
}

/**
 * Recovers orders whose job never reached the queue (Redis was down right after checkout) or
 * died there. The `orders` table plays the outbox: a NEW order older than a couple of minutes
 * with no live job is by definition in need of one. Together with the idempotent processor this
 * makes processing at-least-once with exactly-once effects, with no outbox table.
 */
@Injectable()
export class StaleOrderSweeper implements OnModuleInit {
  constructor(
    private readonly orders: OrdersRepository,
    @InjectQueue(ORDERS_QUEUE) private readonly queue: Queue<ProcessOrderJob>,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(StaleOrderSweeper.name);
  }

  /** Registers the recurring sweep; upserting makes any number of workers share one schedule. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SWEEP_SCHEDULER_ID,
      { every: SWEEP_EVERY_MS },
      {
        name: SWEEP_STALE_ORDERS_JOB,
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: { count: 20 } },
      },
    );
  }

  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = { enqueued: 0, retried: 0, replaced: 0, skipped: 0 };
    const stale = await this.orders.findStaleNewIds(
      new Date(now.getTime() - STALE_AFTER_MS),
      SWEEP_BATCH_SIZE,
    );

    for (const orderId of stale) {
      const job = await this.queue.getJob(orderId);
      if (!job) {
        await this.enqueue(orderId);
        result.enqueued += 1;
        continue;
      }

      const state = await job.getState();
      if (state === 'failed') {
        await job.retry('failed', { resetAttemptsMade: true });
        result.retried += 1;
      } else if (state === 'completed') {
        // A finished job means the processor ran, and it never leaves a NEW order behind.
        this.logger.warn({ orderId }, 'Order is NEW although its job completed; queueing it again');
        await job.remove();
        await this.enqueue(orderId);
        result.replaced += 1;
      } else {
        result.skipped += 1;
      }
    }

    if (result.enqueued + result.retried + result.replaced > 0) {
      this.logger.info({ event: 'orders.swept', ...result }, 'Stale orders requeued');
    }
    return result;
  }

  private async enqueue(orderId: string): Promise<void> {
    await this.queue.add(
      PROCESS_ORDER_JOB,
      { orderId },
      { ...PROCESS_ORDER_OPTIONS, jobId: orderId },
    );
  }
}
