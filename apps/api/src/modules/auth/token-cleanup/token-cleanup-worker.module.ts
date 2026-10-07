import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { logQueueErrors } from '../../../infra/queue/queue-error-logging';
import { RefreshTokensRepository } from '../refresh-tokens.repository';
import { ExpiredTokenSweeper } from './expired-token.sweeper';
import { TOKEN_CLEANUP_QUEUE } from './token-cleanup.constants';
import { TokenCleanupProcessor } from './token-cleanup.processor';

/**
 * Everything that consumes the `token-cleanup` queue. Only the worker process loads it: the API
 * never adds a job to this queue, the recurring sweep is scheduled by the worker itself.
 */
@Module({
  imports: [BullModule.registerQueue({ name: TOKEN_CLEANUP_QUEUE })],
  providers: [
    RefreshTokensRepository,
    ExpiredTokenSweeper,
    TokenCleanupProcessor,
    logQueueErrors(TOKEN_CLEANUP_QUEUE, 'tokens.queue_error'),
  ],
})
export class TokenCleanupWorkerModule {}
