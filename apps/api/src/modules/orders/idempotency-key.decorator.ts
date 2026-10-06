import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { IdempotencyKeyRequiredException } from '../../common/exceptions/app.exception';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;

/** The key itself when it is well-formed; a missing, repeated or malformed header is rejected. */
export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) {
    throw new IdempotencyKeyRequiredException();
  }
  return value;
}

/**
 * The validated `Idempotency-Key` request header. A custom decorator rather than `@Headers()`
 * with a pipe, because Nest does not run pipes on `@Headers()` parameters.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { headers } = context.switchToHttp().getRequest<Request>();
    return parseIdempotencyKey(headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()]);
  },
);
