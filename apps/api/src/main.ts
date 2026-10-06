import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  // `abortOnError: false` turns a startup failure into a rejected promise (handled below)
  // instead of Nest aborting the process with a core dump.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false });
  configureApp(app);
  await app.listen(app.get(AppConfigService).port);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
