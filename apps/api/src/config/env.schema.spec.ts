import { validateEnv } from './env.schema';

const VALID = {
  DATABASE_URL: 'postgresql://app:s3cret@localhost:5432/shop',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts the minimal environment and applies defaults', () => {
    expect(validateEnv(VALID)).toEqual({
      ...VALID,
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      SWAGGER_ENABLED: true,
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_SECONDS: 604800,
      COOKIE_SECURE: false,
    });
  });

  it('reports every missing required variable at once', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
    'rejects an environment without %s',
    (name) => {
      const { [name]: _removed, ...rest } = VALID as Record<string, string>;

      expect(() => validateEnv(rest)).toThrow(name);
    },
  );

  it('never echoes the offending value, which may be a credential', () => {
    const attempt = (): unknown =>
      validateEnv({ ...VALID, DATABASE_URL: 'mysql://root:hunter2@localhost/shop' });

    expect(attempt).toThrow('DATABASE_URL');
    expect(attempt).not.toThrow(/hunter2/);
  });

  it.each([
    ['a non-PostgreSQL database URL', { DATABASE_URL: 'mysql://localhost/shop' }],
    ['a non-Redis URL', { REDIS_URL: 'http://localhost:6379' }],
    ['a port above 65535', { PORT: '70000' }],
    ['a non-numeric port', { PORT: 'abc' }],
    ['an unknown log level', { LOG_LEVEL: 'verbose' }],
    ['an unknown NODE_ENV', { NODE_ENV: 'staging' }],
    ['a boolean spelled "yes"', { SWAGGER_ENABLED: 'yes' }],
    ['a JWT secret shorter than 32 characters', { JWT_ACCESS_SECRET: 'too-short' }],
    ['identical access and refresh secrets', { JWT_REFRESH_SECRET: 'a'.repeat(32) }],
    ['a zero token lifetime', { JWT_ACCESS_TTL_SECONDS: '0' }],
  ])('rejects %s', (_label, override) => {
    expect(() => validateEnv({ ...VALID, ...override })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('coerces the port and parses booleans from strings', () => {
    const env = validateEnv({
      ...VALID,
      PORT: '8080',
      SWAGGER_ENABLED: 'false',
      LOG_LEVEL: 'silent',
    });

    expect(env).toMatchObject({ PORT: 8080, SWAGGER_ENABLED: false, LOG_LEVEL: 'silent' });
  });

  it('accepts rediss:// and a database index in the Redis URL', () => {
    expect(
      validateEnv({ ...VALID, REDIS_URL: 'rediss://cache.example.com:6380/1' }).REDIS_URL,
    ).toBe('rediss://cache.example.com:6380/1');
  });
});
