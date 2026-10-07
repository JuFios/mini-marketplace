import { Job, Queue, UnrecoverableError } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import {
  SWEEP_ORPHAN_IMAGES_EVERY_MS,
  SWEEP_ORPHAN_IMAGES_JOB,
  SWEEP_ORPHAN_IMAGES_SCHEDULER_ID,
} from './image-cleanup.constants';
import { ImageCleanupProcessor } from './image-cleanup.processor';
import type { OrphanImageSweeper } from './orphan-image.sweeper';

function setup() {
  const sweeper = { sweep: jest.fn().mockResolvedValue({ deleted: 0, kept: 0, failed: 0 }) };
  const queue = { upsertJobScheduler: jest.fn(() => Promise.resolve()) };
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const processor = new ImageCleanupProcessor(
    sweeper as unknown as OrphanImageSweeper,
    queue as unknown as Queue,
    logger as unknown as PinoLogger,
  );
  return { processor, sweeper, queue, logger };
}

const jobOf = (name: string) => ({ name }) as unknown as Job;

describe('ImageCleanupProcessor', () => {
  it('registers the recurring sweep once per start, as one attempt a run', async () => {
    const { processor, queue } = setup();

    await processor.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      SWEEP_ORPHAN_IMAGES_SCHEDULER_ID,
      { every: SWEEP_ORPHAN_IMAGES_EVERY_MS },
      expect.objectContaining({
        name: SWEEP_ORPHAN_IMAGES_JOB,
        opts: expect.objectContaining({ attempts: 1 }) as unknown,
      }),
    );
  });

  it('runs the sweeper for the sweep job', async () => {
    const { processor, sweeper } = setup();

    await processor.process(jobOf(SWEEP_ORPHAN_IMAGES_JOB));

    expect(sweeper.sweep).toHaveBeenCalledTimes(1);
  });

  it('lets an error of the sweeper through, so the run is recorded as failed', async () => {
    const { processor, sweeper } = setup();
    sweeper.sweep.mockRejectedValue(new Error('EIO'));

    await expect(processor.process(jobOf(SWEEP_ORPHAN_IMAGES_JOB))).rejects.toThrow('EIO');
  });

  it('fails an unknown job for good: retrying could not help', async () => {
    const { processor, sweeper } = setup();

    await expect(processor.process(jobOf('mystery'))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(sweeper.sweep).not.toHaveBeenCalled();
  });

  it('logs a failed run', () => {
    const { processor, logger } = setup();

    processor.onFailed(jobOf(SWEEP_ORPHAN_IMAGES_JOB), new Error('boom'));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'images.sweep_failed', jobName: SWEEP_ORPHAN_IMAGES_JOB }),
      expect.any(String),
    );
  });
});
