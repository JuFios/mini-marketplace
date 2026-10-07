import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.schema';
import { PublishedSecretsWarning } from './published-secrets.warning';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      validate: validateEnv,
      // The repository keeps one `.env` at the root (shared with docker compose); the API runs
      // from `apps/api`. Variables already present in the environment always take precedence.
      envFilePath: ['.env', '../../.env'],
    }),
  ],
  // The warning sits here because both processes, the API and the worker, load this module.
  providers: [AppConfigService, PublishedSecretsWarning],
  exports: [AppConfigService],
})
export class AppConfigModule {}
