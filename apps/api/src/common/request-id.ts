import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Client-supplied ids end up in every log line, so anything that could forge log structure or
// bloat logs is replaced rather than echoed.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Reuses a well-formed incoming `X-Request-Id`, otherwise generates one. */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return candidate !== undefined && VALID_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

/** Assigns the request id and echoes it to the client; used by the HTTP logger. */
export function assignRequestId(request: IncomingMessage, response: ServerResponse): string {
  const requestId = resolveRequestId(request.headers['x-request-id']);
  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

/**
 * Request id for error responses. Normally the logger middleware has already assigned it;
 * errors raised before it runs (a malformed JSON body is rejected by the body parser first)
 * still get a fresh id so every error response is traceable.
 */
export function readRequestId(request: IncomingMessage, response: ServerResponse): string {
  const assigned: unknown = (request as { id?: unknown }).id;
  if (typeof assigned === 'string' && assigned.length > 0) return assigned;
  return assignRequestId(request, response);
}
