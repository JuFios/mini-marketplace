import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../../src/config/app-config.service';
import { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../../src/infra/redis/redis.module';
import { assertTestTargets } from './test-environment';

/** Empties every table and the test Redis database, so each test file starts from nothing. */
export async function resetDb(app: INestApplication): Promise<void> {
  const config = app.get(AppConfigService);
  assertTestTargets(config.databaseUrl, config.redisUrl);

  const prisma = app.get(PrismaService);
  // Tables come from the catalog, not a hand-kept list, so a table added later is cleaned too.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;

  if (tables.length > 0) {
    // Identifiers cannot be bound parameters; these come from pg_catalog, not from input.
    const identifiers = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`);
    await prisma.$executeRaw`TRUNCATE TABLE ${Prisma.raw(identifiers.join(', '))} RESTART IDENTITY CASCADE`;
  }

  // FLUSHDB empties only the selected database (never FLUSHALL).
  await app.get<Redis>(REDIS_CLIENT).flushdb();
}
