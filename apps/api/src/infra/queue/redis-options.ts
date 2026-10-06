import type { ConnectionOptions } from 'bullmq';

/**
 * Connection options for BullMQ, read from the same `REDIS_URL` as the rest of the application.
 * BullMQ takes options rather than a URL, and builds (and owns) its own connections from them.
 * `maxRetriesPerRequest` is left alone on purpose: workers must wait for Redis as long as it
 * takes, and BullMQ warns about any other value on their blocking connections.
 */
export function redisOptionsFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  return {
    // `URL` keeps the brackets of an IPv6 host; the socket address must not have them.
    host: parsed.hostname.replace(/^\[|\]$/g, ''),
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username && { username: decodeURIComponent(parsed.username) }),
    ...(parsed.password && { password: decodeURIComponent(parsed.password) }),
    db,
    ...(parsed.protocol === 'rediss:' && { tls: {} }),
    retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
  };
}
