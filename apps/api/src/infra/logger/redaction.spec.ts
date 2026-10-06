import pino from 'pino';
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from './redaction';

function logAndCapture(payload: Record<string, unknown>): string {
  const lines: string[] = [];
  const logger = pino(
    { redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_REDACT_CENSOR } },
    { write: (line: string) => lines.push(line) },
  );
  logger.info(payload, 'event');
  return lines.join('');
}

describe('log redaction', () => {
  it('censors credentials in request and response headers', () => {
    const output = logAndCapture({
      req: {
        headers: {
          authorization: 'Bearer eyJ.secret.token',
          cookie: 'refresh_token=secret-cookie',
          'user-agent': 'jest',
        },
      },
      res: { headers: { 'set-cookie': ['refresh_token=secret-cookie; HttpOnly'] } },
    });

    expect(output).not.toContain('eyJ.secret.token');
    expect(output).not.toContain('secret-cookie');
    expect(output).toContain(LOG_REDACT_CENSOR);
  });

  it('censors passwords and tokens logged directly or one level down', () => {
    const output = logAndCapture({
      password: 'hunter2',
      accessToken: 'access-secret',
      user: {
        passwordHash: '$argon2id$secret-hash',
        refreshToken: 'refresh-secret',
        token: 't-secret',
      },
      body: { password: 'nested-hunter2' },
    });

    for (const secret of [
      'hunter2',
      'access-secret',
      'secret-hash',
      'refresh-secret',
      't-secret',
      'nested-hunter2',
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it('leaves harmless fields readable', () => {
    const output = logAndCapture({
      req: { headers: { 'user-agent': 'jest' } },
      user: { id: 'user-1', email: 'a@example.com' },
    });

    expect(output).toContain('jest');
    expect(output).toContain('user-1');
  });
});
