import type { JobsOptions } from 'bullmq';

export const ORDERS_QUEUE = 'orders';

/** Pays for one order. The payload is `ProcessOrderJob`; the job id is the order id. */
export const PROCESS_ORDER_JOB = 'process-order';

export interface ProcessOrderJob {
  orderId: string;
}

/**
 * Retries are for infrastructure failures (database or Redis hiccups, a provider that cannot be
 * reached); a declined payment is a normal outcome and is not retried. Finished jobs are kept
 * for a while so a stuck order can be investigated.
 */
export const PROCESS_ORDER_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 24 * 60 * 60 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const satisfies JobsOptions;

/** The recurring job that finds orders whose hand-over to the queue was lost. */
export const SWEEP_STALE_ORDERS_JOB = 'sweep-stale-orders';
export const SWEEP_SCHEDULER_ID = 'stale-orders';
export const SWEEP_EVERY_MS = 60_000;
/** An order that is still NEW after this long should long since have been picked up. */
export const STALE_AFTER_MS = 2 * 60_000;
/** Upper bound of orders handled per sweep; the rest wait for the next one. */
export const SWEEP_BATCH_SIZE = 200;

export const WORKER_CONCURRENCY = 5;
/** How long placing an order waits for the queue before giving up and leaving it to the sweeper. */
export const ENQUEUE_TIMEOUT_MS = 2_000;
