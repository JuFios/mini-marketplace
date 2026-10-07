import { getQueueToken } from '@nestjs/bullmq';
import type { FactoryProvider } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

/**
 * Sends the errors of the queue registered under `queueName` to the log, as `event`.
 *
 * A BullMQ queue re-emits the errors of its Redis connection (ECONNREFUSED on every reconnect
 * attempt while Redis is down) as its own `error` event, and BullMQ prints an `error` event
 * nobody listens to with console.error, outside the JSON log and its redaction. `@nestjs/bullmq`
 * attaches no listener to the queues it creates. The provider belongs in the module that
 * registers the queue: that module is created once, so the queue gets exactly one listener
 * however many modules inject it.
 */
export function logQueueErrors(queueName: string, event: string): FactoryProvider<void> {
  return {
    provide: `${getQueueToken(queueName)}:error-log`,
    inject: [getQueueToken(queueName), PinoLogger],
    useFactory: (queue: Queue, logger: PinoLogger) => {
      queue.on('error', (error) => {
        logger.warn({ event, queue: queueName, err: error }, 'Queue error');
      });
    },
  };
}
