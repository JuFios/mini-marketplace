import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { ResourceConflictException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';
import { AllExceptionsFilter, ErrorResponseBody } from './all-exceptions.filter';

interface Harness {
  filter: AllExceptionsFilter;
  run: (exception: unknown, request?: Record<string, unknown>) => void;
  json: jest.Mock<void, [ErrorResponseBody]>;
  status: jest.Mock;
  setHeader: jest.Mock;
  end: jest.Mock;
  logError: jest.Mock;
  /** Body passed to `response.json()`. */
  body: () => ErrorResponseBody;
}

function createHarness(headersSent = false): Harness {
  const json = jest.fn<void, [ErrorResponseBody]>();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  const end = jest.fn();
  const logError = jest.fn();
  const response = { status, setHeader, end, headersSent };
  const filter = new AllExceptionsFilter({ error: logError } as unknown as PinoLogger);

  const run = (exception: unknown, request: Record<string, unknown> = {}): void => {
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'req-1', path: '/api/v1/things', headers: {}, ...request }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    filter.catch(exception, host);
  };

  return {
    filter,
    run,
    json,
    status,
    setHeader,
    end,
    logError,
    body: () => json.mock.calls[0][0],
  };
}

describe('AllExceptionsFilter', () => {
  it('writes the standard error envelope for a domain exception', () => {
    const h = createHarness();

    h.run(new ResourceConflictException('Name taken', ErrorCode.CONFLICT, [{ field: 'name' }]));

    expect(h.status).toHaveBeenCalledWith(409);
    expect(h.body()).toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Name taken',
      details: [{ field: 'name' }],
      requestId: 'req-1',
      path: '/api/v1/things',
    });
    expect(new Date(h.body().timestamp).toISOString()).toBe(h.body().timestamp);
  });

  it('omits `details` when there are none', () => {
    const h = createHarness();

    h.run(new NotFoundException());

    expect(h.body()).not.toHaveProperty('details');
  });

  it('does not log client errors (the request log already records them)', () => {
    const h = createHarness();

    h.run(new NotFoundException());

    expect(h.logError).not.toHaveBeenCalled();
  });

  it('answers an unexpected error with a generic 500 and logs the original', () => {
    const h = createHarness();
    const original = new Error('relation "users" does not exist');

    h.run(original);

    expect(h.status).toHaveBeenCalledWith(500);
    expect(h.body()).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(JSON.stringify(h.body())).not.toContain('relation');
    expect(h.logError).toHaveBeenCalledWith(
      { err: original, requestId: 'req-1' },
      'Request failed',
    );
  });

  it('assigns and echoes a request id when the logger middleware has not run yet', () => {
    const h = createHarness();

    h.run(new NotFoundException(), { id: undefined });

    expect(h.body().requestId).toEqual(expect.any(String));
    expect(h.setHeader).toHaveBeenCalledWith('X-Request-Id', h.body().requestId);
  });

  it('only ends the response when headers were already sent', () => {
    const h = createHarness(true);

    h.run(new Error('stream broke'));

    expect(h.end).toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
  });
});
