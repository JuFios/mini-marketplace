import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Hard-coded only until the typed config service exists: configuration must not be read
// from process.env ad hoc, so the placeholder app avoids env access entirely.
const PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT);
}

void bootstrap();
