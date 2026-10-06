import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads `.env` on its own. The repository keeps a single `.env` at the root
// (shared with docker compose); `loadEnvFile` never overrides variables that are already set,
// so real environment variables (CI, containers) always win.
for (const file of ['.env', '../../.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not wrapped in `env()`, which throws when the variable is missing: `prisma generate` runs
    // on every install and needs no database, so a fresh clone without a `.env` must still
    // install. Commands that do need the database report the missing URL themselves.
    url: process.env.DATABASE_URL,
  },
});
