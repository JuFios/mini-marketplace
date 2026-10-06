import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { API_PREFIX } from './common/api-prefix';
import { AppConfigService } from './config/app-config.service';
import {
  LocalDiskImageStorage,
  UPLOADS_URL_PREFIX,
} from './infra/storage/local-disk-image-storage';

const SWAGGER_PATH = 'api/docs';

/**
 * Everything that must be configured on the application instance (as opposed to DI providers).
 * Shared by `main.ts` and the e2e test app so tests exercise the production setup.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  // Only the refresh cookie is read from cookies; the access token travels in a header.
  app.use(cookieParser());
  // Uploaded images: public, outside the API prefix and the auth guards. File names are random
  // UUIDs and never change, so they can be cached for good.
  app.use(
    UPLOADS_URL_PREFIX,
    express.static(app.get(LocalDiskImageStorage).directory, {
      index: false,
      dotfiles: 'deny',
      immutable: true,
      maxAge: '365d',
    }),
  );
  // Set before the Swagger document is built so documented paths include the prefix.
  app.setGlobalPrefix(API_PREFIX);
  // SIGTERM/SIGINT close the app, which disconnects Prisma and Redis.
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Mini Marketplace API')
        .setDescription('REST API of the Mini Marketplace')
        .setVersion('1.0')
        .addBearerAuth()
        .addCookieAuth('refresh_token')
        .build(),
    );
    SwaggerModule.setup(SWAGGER_PATH, app, document, { jsonDocumentUrl: `${SWAGGER_PATH}-json` });
  }
}
