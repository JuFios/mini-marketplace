import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './error-messages';
import { ApiError, getFieldErrors, hasErrorCode, toApiError } from './errors';

describe('toApiError', () => {
  it('returns an ApiError unchanged', () => {
    const error = new ApiError({ status: 409, code: 'CONFLICT', message: 'x' });

    expect(toApiError(error)).toBe(error);
  });

  it('wraps a thrown non-HTTP error without losing its message', () => {
    expect(toApiError(new Error('boom'))).toMatchObject({
      status: 0,
      code: 'UNKNOWN_ERROR',
      message: 'boom',
    });
  });

  it('takes the request id from the header when the body has none', () => {
    const config = { headers: {} } as never;
    const response = {
      status: 500,
      data: 'oops',
      headers: { 'x-request-id': 'req-9' },
      config,
      statusText: '',
    };

    const error = toApiError(
      new AxiosError('failed', 'ERR_BAD_RESPONSE', config, undefined, response),
    );

    expect(error).toMatchObject({ status: 500, code: 'UNKNOWN_ERROR', requestId: 'req-9' });
  });
});

describe('getFieldErrors', () => {
  const validation = (details: unknown) =>
    new ApiError({ status: 400, code: 'VALIDATION_FAILED', message: 'x', details });

  it('returns the first message of each field', () => {
    const error = validation([
      { field: 'email', messages: ['email must be an email', 'second'] },
      { field: 'password', messages: ['too short'] },
    ]);

    expect(getFieldErrors(error)).toEqual([
      { field: 'email', message: 'email must be an email' },
      { field: 'password', message: 'too short' },
    ]);
  });

  it('skips malformed entries', () => {
    expect(getFieldErrors(validation([{ field: 'a' }, null, 'x', { messages: ['m'] }]))).toEqual(
      [],
    );
  });

  it('is empty for other errors and non-errors', () => {
    expect(getFieldErrors(new ApiError({ status: 409, code: 'CONFLICT', message: 'x' }))).toEqual(
      [],
    );
    expect(getFieldErrors(new Error('x'))).toEqual([]);
  });
});

describe('hasErrorCode', () => {
  it('matches ApiErrors by code only', () => {
    expect(hasErrorCode(new ApiError({ status: 409, code: 'A', message: 'm' }), 'A')).toBe(true);
    expect(hasErrorCode(new ApiError({ status: 409, code: 'A', message: 'm' }), 'B')).toBe(false);
    expect(hasErrorCode(new Error('A'), 'A')).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('uses the prepared wording for known codes', () => {
    const error = new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'raw' });

    expect(getErrorMessage(error)).toBe('Invalid email or password.');
  });

  it('shows the API message for other client errors', () => {
    const error = new ApiError({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Not enough stock for "Mouse"',
    });

    expect(getErrorMessage(error)).toBe('Not enough stock for "Mouse"');
  });

  it('hides the message of server errors and non-API errors', () => {
    const serverError = new ApiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'stack trace…',
    });

    expect(getErrorMessage(serverError)).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage(new Error('secret'))).toBe('Something went wrong. Please try again.');
  });
});
