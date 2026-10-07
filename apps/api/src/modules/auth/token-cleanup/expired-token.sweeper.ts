import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RefreshTokensRepository } from '../refresh-tokens.repository';
import { EXPIRED_TOKEN_GRACE_MS, SWEEP_BATCH_SIZE } from './token-cleanup.constants';

/**
 * Deletes the rows of refresh tokens that have expired. Every login and every refresh adds a row,
 * and nothing else removes one, so without this the table only grows.
 *
 * Only expiry counts, never revocation: a revoked token that has not expired still passes the
 * signature and expiry check, and its row is what recognises it as replayed and revokes the
 * session (see `AuthService.refresh`). Safe to run any number of times, also at once: a row
 * deleted twice is simply not counted twice.
 */
@Injectable()
export class ExpiredTokenSweeper {
  constructor(
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(ExpiredTokenSweeper.name);
  }

  /** Returns how many rows it deleted. */
  async sweep(now: Date = new Date()): Promise<number> {
    const before = new Date(now.getTime() - EXPIRED_TOKEN_GRACE_MS);
    let deleted = 0;
    let batch: number;
    do {
      batch = await this.refreshTokens.deleteExpiredBefore(before, SWEEP_BATCH_SIZE);
      deleted += batch;
    } while (batch === SWEEP_BATCH_SIZE);

    if (deleted > 0) {
      this.logger.info({ event: 'tokens.swept', deleted }, 'Expired refresh tokens removed');
    }
    return deleted;
  }
}
