import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { AppConfigService, PUBLISHED_SECRET_PREFIX } from './app-config.service';
import type { Env } from './env.schema';
import { PublishedSecretsWarning } from './published-secrets.warning';

// The values `.env.example` and the compose file publish.
const PUBLISHED_ACCESS = 'dev-only-access-secret-change-me-0123456789';
const PUBLISHED_REFRESH = 'dev-only-refresh-secret-change-me-987654321';
const OWN_ACCESS = 'access-secret-chosen-for-this-deployment';
const OWN_REFRESH = 'refresh-secret-chosen-for-this-deployment';

function setup(env: Pick<Env, 'NODE_ENV' | 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'>) {
  const config = new AppConfigService({
    get: (key: keyof typeof env) => env[key],
  } as unknown as ConfigService<Env, true>);
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const warning = new PublishedSecretsWarning(config, logger as unknown as PinoLogger);
  return { config, logger, warning };
}

describe('PublishedSecretsWarning', () => {
  it('recognises every JWT secret the repository publishes', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    const published = ['.env.example', 'docker-compose.yml'].flatMap((file) =>
      [
        ...readFileSync(join(root, file), 'utf8').matchAll(
          /JWT_(?:ACCESS|REFRESH)_SECRET(?:=|: \$\{JWT_(?:ACCESS|REFRESH)_SECRET:-)([^}\s]+)/g,
        ),
      ].map((match) => match[1]),
    );

    expect(published).toHaveLength(4);
    expect(published.every((secret) => secret?.startsWith(PUBLISHED_SECRET_PREFIX))).toBe(true);
  });

  it.each([
    ['both secrets', PUBLISHED_ACCESS, PUBLISHED_REFRESH],
    ['the access secret', PUBLISHED_ACCESS, OWN_REFRESH],
    ['the refresh secret', OWN_ACCESS, PUBLISHED_REFRESH],
  ])('warns once in production when %s is published', (_label, access, refresh) => {
    const { config, logger, warning } = setup({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: access,
      JWT_REFRESH_SECRET: refresh,
    });

    warning.onApplicationBootstrap();

    expect(config.usesPublishedDevSecrets).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { event: 'config.insecure_secrets' },
      expect.any(String),
    );
  });

  it('never logs the secrets themselves', () => {
    const { logger, warning } = setup({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: PUBLISHED_ACCESS,
      JWT_REFRESH_SECRET: PUBLISHED_REFRESH,
    });

    warning.onApplicationBootstrap();

    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toContain(PUBLISHED_ACCESS);
    expect(logged).not.toContain(PUBLISHED_REFRESH);
  });

  it('stays silent in production with secrets of its own', () => {
    const { config, logger, warning } = setup({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: OWN_ACCESS,
      JWT_REFRESH_SECRET: OWN_REFRESH,
    });

    warning.onApplicationBootstrap();

    expect(config.usesPublishedDevSecrets).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each(['development', 'test'] as const)(
    'stays silent in %s, where the published secrets are meant to be used',
    (nodeEnv) => {
      const { logger, warning } = setup({
        NODE_ENV: nodeEnv,
        JWT_ACCESS_SECRET: PUBLISHED_ACCESS,
        JWT_REFRESH_SECRET: PUBLISHED_REFRESH,
      });

      warning.onApplicationBootstrap();

      expect(logger.warn).not.toHaveBeenCalled();
    },
  );
});
