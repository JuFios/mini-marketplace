import { existsSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = join(__dirname, '..', '..');

/**
 * Loads the e2e environment into `process.env`. `loadEnvFile` never overrides a variable that
 * is already set, so real environment variables win, then `.env.test.local`, then `.env.test`.
 */
export function loadTestEnv(): void {
  for (const file of ['.env.test.local', '.env.test']) {
    const path = join(API_ROOT, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

/**
 * The suite truncates tables and flushes Redis, so it must be impossible to aim it at
 * development data by accident (a stray `DATABASE_URL` in the shell, say). Throws unless both
 * URLs point at clearly dedicated test targets.
 */
export function assertTestTargets(databaseUrl: string, redisUrl: string): void {
  const database = new URL(databaseUrl).pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests: database "${database}" does not end with "_test".`);
  }

  const redisDb = new URL(redisUrl).pathname.slice(1);
  if (redisDb === '' || redisDb === '0') {
    throw new Error(
      'Refusing to run e2e tests: REDIS_URL must select a dedicated database (e.g. /1).',
    );
  }
}
