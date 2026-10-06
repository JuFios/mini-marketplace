/**
 * Log fields whose values are replaced before a line is written. Covers the HTTP request and
 * response metadata the logger records itself, plus the sensitive keys a developer could pass
 * to a log call by accident (directly or one level down, e.g. `{ user: { passwordHash } }`).
 */
export const LOG_REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

export const LOG_REDACT_CENSOR = '[REDACTED]';
