import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  // An application context, not an HTTP server: the process only consumes the queue.
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  // SIGTERM/SIGINT close the app, which lets a running job finish before the worker disconnects.
  app.enableShutdownHooks();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
