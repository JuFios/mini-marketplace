import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { API_PREFIX } from './common/api-prefix';
import { AppConfigService } from './config/app-config.service';

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
