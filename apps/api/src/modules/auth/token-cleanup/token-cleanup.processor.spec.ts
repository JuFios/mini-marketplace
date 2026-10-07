import { Job, Queue, UnrecoverableError } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import type { ExpiredTokenSweeper } from './expired-token.sweeper';
import {
  SWEEP_EXPIRED_TOKENS_EVERY_MS,
  SWEEP_EXPIRED_TOKENS_JOB,
  SWEEP_EXPIRED_TOKENS_SCHEDULER_ID,
} from './token-cleanup.constants';
import { TokenCleanupProcessor } from './token-cleanup.processor';

function setup() {
  const sweeper = { sweep: jest.fn().mockResolvedValue(0) };
  const queue = { upsertJobScheduler: jest.fn(() => Promise.resolve()) };
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const processor = new TokenCleanupProcessor(
    sweeper as unknown as ExpiredTokenSweeper,
    queue as unknown as Queue,
    logger as unknown as PinoLogger,
  );
  return { processor, sweeper, queue, logger };
}

const jobOf = (name: string) => ({ name }) as unknown as Job;

describe('TokenCleanupProcessor', () => {
  it('registers the recurring sweep once per start, as one attempt a run', async () => {
    const { processor, queue } = setup();

    await processor.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      SWEEP_EXPIRED_TOKENS_SCHEDULER_ID,
      { every: SWEEP_EXPIRED_TOKENS_EVERY_MS },
      expect.objectContaining({
        name: SWEEP_EXPIRED_TOKENS_JOB,
        opts: expect.objectContaining({ attempts: 1 }) as unknown,
      }),
    );
  });

  it('runs the sweeper for the sweep job', async () => {
    const { processor, sweeper } = setup();

    await processor.process(jobOf(SWEEP_EXPIRED_TOKENS_JOB));

    expect(sweeper.sweep).toHaveBeenCalledTimes(1);
  });

  it('lets an error of the sweeper through, so the run is recorded as failed', async () => {
    const { processor, sweeper } = setup();
    sweeper.sweep.mockRejectedValue(new Error('connection lost'));

    await expect(processor.process(jobOf(SWEEP_EXPIRED_TOKENS_JOB))).rejects.toThrow(
      'connection lost',
    );
  });

  it('fails an unknown job for good: retrying could not help', async () => {
    const { processor, sweeper } = setup();

    await expect(processor.process(jobOf('mystery'))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(sweeper.sweep).not.toHaveBeenCalled();
  });

  it('logs a failed run', () => {
    const { processor, logger } = setup();

    processor.onFailed(jobOf(SWEEP_EXPIRED_TOKENS_JOB), new Error('boom'));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'tokens.sweep_failed', jobName: SWEEP_EXPIRED_TOKENS_JOB }),
      expect.any(String),
    );
  });

  it('logs an error of the worker itself, which BullMQ would otherwise print to the console', () => {
    const { processor, logger } = setup();
    const error = new Error('Connection is closed.');

    processor.onError(error);

    expect(logger.warn).toHaveBeenCalledWith(
      { event: 'tokens.worker_error', err: error },
      expect.any(String),
    );
  });
});
