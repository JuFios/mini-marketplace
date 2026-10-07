import type { PinoLogger } from 'nestjs-pino';
import type { RefreshTokensRepository } from '../refresh-tokens.repository';
import { ExpiredTokenSweeper } from './expired-token.sweeper';
import { EXPIRED_TOKEN_GRACE_MS, SWEEP_BATCH_SIZE } from './token-cleanup.constants';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function setup(batches: number[]) {
  const deleteExpiredBefore = jest.fn<Promise<number>, [Date, number]>();
  for (const count of batches) deleteExpiredBefore.mockResolvedValueOnce(count);
  const logger = { setContext: jest.fn(), info: jest.fn() };
  const sweeper = new ExpiredTokenSweeper(
    { deleteExpiredBefore } as unknown as RefreshTokensRepository,
    logger as unknown as PinoLogger,
  );
  return { sweeper, deleteExpiredBefore, logger };
}

describe('ExpiredTokenSweeper', () => {
  it('deletes only tokens that expired longer ago than the grace period', async () => {
    const { sweeper, deleteExpiredBefore } = setup([0]);

    await sweeper.sweep(NOW);

    expect(deleteExpiredBefore).toHaveBeenCalledWith(
      new Date(NOW.getTime() - EXPIRED_TOKEN_GRACE_MS),
      SWEEP_BATCH_SIZE,
    );
  });

  it('deletes batch after batch until one comes back short, and adds them up', async () => {
    const { sweeper, deleteExpiredBefore } = setup([SWEEP_BATCH_SIZE, SWEEP_BATCH_SIZE, 7]);

    await expect(sweeper.sweep(NOW)).resolves.toBe(2 * SWEEP_BATCH_SIZE + 7);

    expect(deleteExpiredBefore).toHaveBeenCalledTimes(3);
  });

  it('asks once more after a full batch, even if that finds nothing', async () => {
    const { sweeper, deleteExpiredBefore } = setup([SWEEP_BATCH_SIZE, 0]);

    await expect(sweeper.sweep(NOW)).resolves.toBe(SWEEP_BATCH_SIZE);

    expect(deleteExpiredBefore).toHaveBeenCalledTimes(2);
  });

  it('logs what it deleted', async () => {
    const { sweeper, logger } = setup([3]);

    await sweeper.sweep(NOW);

    expect(logger.info).toHaveBeenCalledWith(
      { event: 'tokens.swept', deleted: 3 },
      expect.any(String),
    );
  });

  it('stays silent when there was nothing to delete', async () => {
    const { sweeper, logger } = setup([0]);

    await expect(sweeper.sweep(NOW)).resolves.toBe(0);

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('lets a database error through, so the run is recorded as failed', async () => {
    const { sweeper, deleteExpiredBefore } = setup([]);
    deleteExpiredBefore.mockRejectedValue(new Error('connection lost'));

    await expect(sweeper.sweep(NOW)).rejects.toThrow('connection lost');
  });
});
