import type { Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import type { OrdersRepository } from '../orders.repository';
import {
  PROCESS_ORDER_JOB,
  ProcessOrderJob,
  STALE_AFTER_MS,
  SWEEP_BATCH_SIZE,
  SWEEP_EVERY_MS,
  SWEEP_SCHEDULER_ID,
  SWEEP_STALE_ORDERS_JOB,
} from './order-queue.constants';
import { StaleOrderSweeper } from './stale-order.sweeper';

type JobState = 'waiting' | 'active' | 'delayed' | 'failed' | 'completed' | 'prioritized';

const NOW = new Date('2026-10-06T12:00:00.000Z');

function job(state: JobState) {
  return {
    getState: jest.fn(() => Promise.resolve(state)),
    retry: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
  };
}

/** `jobs` maps an order id to the state of its job; ids that are absent have no job. */
function setup(staleIds: string[], jobs: Record<string, JobState> = {}) {
  const found = Object.fromEntries(Object.entries(jobs).map(([id, state]) => [id, job(state)]));
  const orders = { findStaleNewIds: jest.fn(() => Promise.resolve(staleIds)) };
  const queue = {
    getJob: jest.fn((id: string) => Promise.resolve(found[id])),
    add: jest.fn(() => Promise.resolve()),
    upsertJobScheduler: jest.fn(() => Promise.resolve()),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const sweeper = new StaleOrderSweeper(
    orders as unknown as OrdersRepository,
    queue as unknown as Queue<ProcessOrderJob>,
    logger as unknown as PinoLogger,
  );
  return { sweeper, orders, queue, logger, found };
}

describe('StaleOrderSweeper', () => {
  it('looks only at NEW orders older than the staleness limit, in a bounded batch', async () => {
    const { sweeper, orders } = setup([]);

    await sweeper.sweep(NOW);

    expect(orders.findStaleNewIds).toHaveBeenCalledWith(
      new Date(NOW.getTime() - STALE_AFTER_MS),
      SWEEP_BATCH_SIZE,
    );
  });

  it('queues a job, under the order id, for a stale order that has none (the hand-over was lost)', async () => {
    const { sweeper, queue } = setup(['order-1']);

    const result = await sweeper.sweep(NOW);

    expect(queue.add).toHaveBeenCalledWith(
      PROCESS_ORDER_JOB,
      { orderId: 'order-1' },
      expect.objectContaining({ jobId: 'order-1', attempts: 5 }),
    );
    expect(result).toEqual({ enqueued: 1, retried: 0, replaced: 0, skipped: 0 });
  });

  it('retries a failed job from scratch', async () => {
    const { sweeper, queue, found } = setup(['order-1'], { 'order-1': 'failed' });

    const result = await sweeper.sweep(NOW);

    expect(found['order-1'].retry).toHaveBeenCalledWith('failed', { resetAttemptsMade: true });
    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: 0, retried: 1, replaced: 0, skipped: 0 });
  });

  it.each(['waiting', 'active', 'delayed', 'prioritized'] as const)(
    'leaves a %s job alone',
    async (state) => {
      const { sweeper, queue, found } = setup(['order-1'], { 'order-1': state });

      const result = await sweeper.sweep(NOW);

      expect(queue.add).not.toHaveBeenCalled();
      expect(found['order-1'].retry).not.toHaveBeenCalled();
      expect(found['order-1'].remove).not.toHaveBeenCalled();
      expect(result).toEqual({ enqueued: 0, retried: 0, replaced: 0, skipped: 1 });
    },
  );

  it('replaces a completed job whose order is still NEW, and warns: that should not happen', async () => {
    const { sweeper, queue, found, logger } = setup(['order-1'], { 'order-1': 'completed' });

    const result = await sweeper.sweep(NOW);

    expect(found['order-1'].remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      PROCESS_ORDER_JOB,
      { orderId: 'order-1' },
      expect.objectContaining({ jobId: 'order-1' }),
    );
    expect(logger.warn).toHaveBeenCalledWith({ orderId: 'order-1' }, expect.any(String));
    expect(result).toEqual({ enqueued: 0, retried: 0, replaced: 1, skipped: 0 });
  });

  it('handles a mixed batch order by order', async () => {
    const { sweeper } = setup(['lost', 'broken', 'running', 'queued'], {
      broken: 'failed',
      running: 'active',
      queued: 'waiting',
    });

    expect(await sweeper.sweep(NOW)).toEqual({ enqueued: 1, retried: 1, replaced: 0, skipped: 2 });
  });

  it('logs a sweep that did something, and stays quiet when there was nothing to do', async () => {
    const quiet = setup(['order-1'], { 'order-1': 'active' });
    await quiet.sweeper.sweep(NOW);
    expect(quiet.logger.info).not.toHaveBeenCalled();

    const busy = setup(['order-1']);
    await busy.sweeper.sweep(NOW);
    expect(busy.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'orders.swept', enqueued: 1 }),
      expect.any(String),
    );
  });

  it('does nothing when no order is stale', async () => {
    const { sweeper, queue } = setup([]);

    expect(await sweeper.sweep(NOW)).toEqual({ enqueued: 0, retried: 0, replaced: 0, skipped: 0 });
    expect(queue.getJob).not.toHaveBeenCalled();
  });

  it('registers one recurring sweep on start', async () => {
    const { sweeper, queue } = setup([]);

    await sweeper.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      SWEEP_SCHEDULER_ID,
      { every: SWEEP_EVERY_MS },
      expect.objectContaining({ name: SWEEP_STALE_ORDERS_JOB }),
    );
  });
});
