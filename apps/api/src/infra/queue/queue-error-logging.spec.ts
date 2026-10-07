import { EventEmitter } from 'node:events';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { logQueueErrors } from './queue-error-logging';

/** Resolves the provider the way Nest does: the queue and the logger come from the module. */
async function setup() {
  const queue = new EventEmitter();
  const logger = { warn: jest.fn() };
  await Test.createTestingModule({
    providers: [
      { provide: getQueueToken('reports'), useValue: queue },
      { provide: PinoLogger, useValue: logger },
      logQueueErrors('reports', 'reports.queue_error'),
    ],
  }).compile();
  return { queue, logger };
}

describe('logQueueErrors', () => {
  it('logs an error of the queue as a warning under the given event', async () => {
    const { queue, logger } = await setup();
    const error = new Error('connect ECONNREFUSED 127.0.0.1:6379');

    queue.emit('error', error);

    expect(logger.warn).toHaveBeenCalledWith(
      { event: 'reports.queue_error', queue: 'reports', err: error },
      'Queue error',
    );
  });

  it('attaches a single listener, so each error is logged once', async () => {
    const { queue, logger } = await setup();

    queue.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:6379'));

    expect(queue.listenerCount('error')).toBe(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
