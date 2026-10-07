import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from './app-config.service';

/**
 * Warns once at start when a production-mode process signs tokens with the published development
 * secrets. The compose file falls back to them so that the stack starts without any setup, which
 * also means anyone who has read the repository can forge a token for it. Only a warning: the
 * zero-config demo must keep starting. The values themselves are never logged.
 */
@Injectable()
export class PublishedSecretsWarning implements OnApplicationBootstrap {
  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(PublishedSecretsWarning.name);
  }

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv !== 'production' || !this.config.usesPublishedDevSecrets) return;
    this.logger.warn(
      { event: 'config.insecure_secrets' },
      'JWT secrets are the published development values: anyone can forge tokens. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.',
    );
  }
}
