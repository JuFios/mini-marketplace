import { Job, UnrecoverableError } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import type { OrderProcessingService } from '../order-processing.service';
import { OrderProcessingProcessor } from './order-processing.processor';
import {
  PROCESS_ORDER_JOB,
  ProcessOrderJob,
  SWEEP_STALE_ORDERS_JOB,
} from './order-queue.constants';
import type { StaleOrderSweeper } from './stale-order.sweeper';

function setup() {
  const processing = { process: jest.fn().mockResolvedValue('paid') };
  const sweeper = { sweep: jest.fn().mockResolvedValue({}) };
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const processor = new OrderProcessingProcessor(
    processing as unknown as OrderProcessingService,
    sweeper as unknown as StaleOrderSweeper,
    logger as unknown as PinoLogger,
  );
  return { processor, processing, sweeper, logger };
}

const jobOf = (name: string, data: unknown = {}) =>
  ({ name, data }) as unknown as Job<ProcessOrderJob>;

describe('OrderProcessingProcessor', () => {
  it('hands a process-order job to the processing service with its order id', async () => {
    const { processor, processing, sweeper } = setup();

    await processor.process(jobOf(PROCESS_ORDER_JOB, { orderId: 'order-1' }));

    expect(processing.process).toHaveBeenCalledWith('order-1');
    expect(sweeper.sweep).not.toHaveBeenCalled();
  });

  it('runs the sweeper for the recurring sweep job', async () => {
    const { processor, processing, sweeper } = setup();

    await processor.process(jobOf(SWEEP_STALE_ORDERS_JOB));

    expect(sweeper.sweep).toHaveBeenCalled();
    expect(processing.process).not.toHaveBeenCalled();
  });

  it('lets an error of the processing service through, so the job is retried', async () => {
    const { processor, processing } = setup();
    processing.process.mockRejectedValue(new Error('database unreachable'));

    await expect(
      processor.process(jobOf(PROCESS_ORDER_JOB, { orderId: 'order-1' })),
    ).rejects.toThrow('database unreachable');
  });

  it('fails an unknown job for good: retrying could not help', async () => {
    const { processor } = setup();

    await expect(processor.process(jobOf('mystery'))).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('logs a failed attempt with the order and the attempt number', () => {
    const { processor, logger } = setup();
    const failed = {
      name: PROCESS_ORDER_JOB,
      data: { orderId: 'order-1' },
      attemptsMade: 2,
      opts: { attempts: 5 },
    } as unknown as Job<ProcessOrderJob>;

    processor.onFailed(failed, new Error('boom'));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'order.processing_failed',
        orderId: 'order-1',
        attempt: 2,
        attempts: 5,
      }),
      expect.any(String),
    );
  });
});
