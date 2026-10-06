import type { Queue } from 'bullmq';
import { ENQUEUE_TIMEOUT_MS, PROCESS_ORDER_JOB, ProcessOrderJob } from './order-queue.constants';
import { OrderProcessingProducer } from './order-processing.producer';

const producerOver = (add: jest.Mock) =>
  new OrderProcessingProducer({ add } as unknown as Queue<ProcessOrderJob>);

describe('OrderProcessingProducer', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('adds a process-order job whose id is the order id, with retries and backoff', async () => {
    const add = jest.fn().mockResolvedValue(undefined);

    await producerOver(add).orderCreated('order-1');

    expect(add).toHaveBeenCalledWith(
      PROCESS_ORDER_JOB,
      { orderId: 'order-1' },
      {
        jobId: 'order-1',
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 604_800 },
      },
    );
  });

  it('fails when the queue refuses, for the caller to log', async () => {
    const add = jest.fn().mockRejectedValue(new Error('Connection is closed'));

    await expect(producerOver(add).orderCreated('order-1')).rejects.toThrow('Connection is closed');
  });

  it('gives up after a bounded wait instead of holding the request while Redis is down', async () => {
    jest.useFakeTimers();
    const add = jest.fn(() => new Promise<void>(() => undefined));

    const outcome = expect(producerOver(add).orderCreated('order-1')).rejects.toThrow(/Timed out/);
    await jest.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS);

    await outcome;
  });
});
