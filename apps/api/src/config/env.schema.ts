import { z } from 'zod';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

// Environment values are always strings, so booleans are spelled out instead of coerced:
// `Boolean('false')` is `true`.
const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

// Kept separate from `envSchema` because zod cannot `pick()` from a schema with refinements.
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SWAGGER_ENABLED: booleanFlag.default(true),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // 32 characters is the floor for an HS256 key; the two secrets are separate on purpose so a
  // leaked access-token key cannot forge refresh tokens.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(1).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(1).default(604_800),
  // `Secure` cookies are only sent over HTTPS: enable wherever the API is served over TLS.
  COOKIE_SECURE: booleanFlag.default(false),
  // How many reverse proxies stand between the clients and the API (0 = none: the API is
  // reached directly). Only then is the client address read from `X-Forwarded-For`; a header
  // from a direct client is never believed, so it cannot be used to dodge the rate limits.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  // Product images are stored on local disk and served from /uploads.
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1).default(2_097_152),
  // How long a cached catalog response may be served at most (writes invalidate it sooner).
  CATALOG_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).default(120),
  // The mock payment provider: the share of orders it declines (0 never, 1 always; the verdict
  // for an order is fixed, see MockPaymentProvider) and how long a charge takes.
  PAYMENT_MOCK_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  PAYMENT_MOCK_DELAY_MS: z.coerce.number().int().min(0).max(30_000).default(1_000),
});

export const envSchema = baseEnvSchema.refine(
  (env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET,
  { path: ['JWT_REFRESH_SECRET'], message: 'must differ from JWT_ACCESS_SECRET' },
);

export type Env = z.infer<typeof baseEnvSchema>;

/**
 * Validates the raw environment and fails fast with every problem at once. The message lists
 * variable names and reasons only, never the offending values: they may be credentials.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const problems = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
}
