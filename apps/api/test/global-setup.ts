import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { assertTestTargets, loadTestEnv } from './helpers/test-environment';

export default function globalSetup(): void {
  loadTestEnv();
  assertTestTargets(process.env.DATABASE_URL ?? '', process.env.REDIS_URL ?? '');

  // Brings the dedicated test database to the current schema; a no-op when it already is.
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
}
