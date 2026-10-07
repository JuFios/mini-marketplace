import type { Server } from 'node:http';
import { INestApplication, Provider, Type } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { OrderWorkerModule } from '../../src/modules/orders/order-worker.module';
import { REDIS_CLIENT } from '../../src/infra/redis/redis.module';

/**
 * Boots the real application (same modules and setup as production) against the test database
 * and Redis. `customize` can override providers, e.g. to simulate a dependency outage;
 * `controllers` registers extra, test-only routes next to the real ones.
 *
 * Orders are handed to the queue as in production, but nothing consumes it unless `worker` is
 * set: then the order worker runs inside the test app, so a placed order is paid by the mock
 * provider like in a deployment. Without it orders stay NEW, which is what the tests of the
 * order lifecycle rely on. `providers` adds services that only the worker process has, so a test
 * can run one by hand against the real database without starting the queue consumers.
 */
export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
  controllers: Type<unknown>[] = [],
  { worker = false, providers = [] }: { worker?: boolean; providers?: Provider[] } = {},
): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: worker ? [AppModule, OrderWorkerModule] : [AppModule],
    controllers,
    providers,
  });
  const moduleRef = await (customize ? customize(builder) : builder).compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  try {
    // Listening once, on an ephemeral port: supertest would otherwise call `listen` on the same
    // server for every request, which races when requests are sent in parallel.
    await app.listen(0, '127.0.0.1');
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
