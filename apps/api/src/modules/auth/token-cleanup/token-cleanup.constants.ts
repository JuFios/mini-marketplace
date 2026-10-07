export const TOKEN_CLEANUP_QUEUE = 'token-cleanup';

/** The recurring job that deletes the rows of expired refresh tokens. */
export const SWEEP_EXPIRED_TOKENS_JOB = 'sweep-expired-tokens';
export const SWEEP_EXPIRED_TOKENS_SCHEDULER_ID = 'expired-tokens';
export const SWEEP_EXPIRED_TOKENS_EVERY_MS = 24 * 60 * 60_000;

/** Rows deleted per statement. */
export const SWEEP_BATCH_SIZE = 1_000;

/**
 * How long a token's row outlives the token. The API rejects an expired refresh token by its
 * signed expiry before it reads the row, so the row is of no use from then on; the margin only
 * absorbs clocks that disagree between the API, the worker and the database.
 */
export const EXPIRED_TOKEN_GRACE_MS = 60 * 60_000;
