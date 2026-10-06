import type { IncomingMessage, ServerResponse } from 'node:http';
import { assignRequestId, readRequestId, resolveRequestId } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reuses a well-formed client id', () => {
    expect(resolveRequestId('abc-123_DEF.4')).toBe('abc-123_DEF.4');
  });

  it('uses the first value when the header was sent more than once', () => {
    expect(resolveRequestId(['first', 'second'])).toBe('first');
  });

  it.each([
    ['is missing', undefined],
    ['is empty', ''],
    ['contains spaces', 'two words'],
    ['contains a newline (log injection)', 'abc\n{"level":60}'],
    ['is longer than 128 characters', 'a'.repeat(129)],
  ])('generates a fresh id when the client id %s', (_label, incoming) => {
    expect(resolveRequestId(incoming)).toMatch(UUID);
  });
});

describe('assignRequestId / readRequestId', () => {
  const requestWith = (headers: Record<string, string>, id?: string): IncomingMessage =>
    ({ headers, id }) as unknown as IncomingMessage;

  it('echoes the assigned id in the response header', () => {
    const setHeader = jest.fn();

    const id = assignRequestId(requestWith({ 'x-request-id': 'from-client' }), {
      setHeader,
    } as unknown as ServerResponse);

    expect(id).toBe('from-client');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'from-client');
  });

  it('prefers the id the logger middleware already assigned', () => {
    const setHeader = jest.fn();

    const id = readRequestId(requestWith({}, 'already-set'), {
      setHeader,
    } as unknown as ServerResponse);

    expect(id).toBe('already-set');
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('assigns a new id when none exists yet', () => {
    const setHeader = jest.fn();

    const id = readRequestId(requestWith({}), { setHeader } as unknown as ServerResponse);

    expect(id).toMatch(UUID);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id);
  });
});
