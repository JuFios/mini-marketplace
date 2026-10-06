import type { Server } from 'node:http';
import { INestApplication, Type } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { REDIS_CLIENT } from '../../src/infra/redis/redis.module';

/**
 * Boots the real application (same modules and setup as production) against the test database
 * and Redis. `customize` can override providers, e.g. to simulate a dependency outage;
 * `controllers` registers extra, test-only routes next to the real ones.
 */
export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
  controllers: Type<unknown>[] = [],
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule], controllers });
  const moduleRef = await (customize ? customize(builder) : builder).compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  try {
    await app.init();
    // The application does not wait for Redis (its cache paths fail open), so a test could
    // otherwise start, or tear the app down, while the client is still connecting. A failed
    // ping is fine: tests that simulate an outage override the client on purpose.
    await app
      .get<Redis>(REDIS_CLIENT)
      .ping()
      .catch(() => undefined);
  } catch (error) {
    // A half-started app keeps its Redis/Postgres connections open, which would stop Jest
    // from ever exiting and hide the real error behind a hang.
    await app.close();
    throw error;
  }
  return app;
}

/** `getHttpServer()` is typed `any` by Nest; this gives supertest a properly typed server. */
export function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
