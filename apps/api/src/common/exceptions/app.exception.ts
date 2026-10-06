import { HttpStatus } from '@nestjs/common';
import type { OrderStatus } from '../../generated/prisma/client';
import { ErrorCode } from './error-codes';

/**
 * Base class of every domain error. Services throw subclasses (never raw strings or Nest
 * `HttpException`s) so the response always carries a stable `code`.
 */
export class AppException extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export interface ValidationErrorDetail {
  field: string;
  messages: string[];
}

export class ValidationFailedException extends AppException {
  constructor(details: ValidationErrorDetail[]) {
    super(
      ErrorCode.VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      'Request validation failed',
      details,
    );
  }
}

export class IdempotencyKeyRequiredException extends AppException {
  constructor() {
    super(
      ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      HttpStatus.BAD_REQUEST,
      'The Idempotency-Key header is required: 8-64 characters from A-Z, a-z, 0-9, "_" and "-"',
    );
  }
}

export class UnauthorizedAppException extends AppException {
  constructor(message = 'Authentication required', code: ErrorCode = ErrorCode.UNAUTHORIZED) {
    super(code, HttpStatus.UNAUTHORIZED, message);
  }
}

export class InvalidCredentialsException extends UnauthorizedAppException {
  constructor() {
    super('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
  }
}

export class RefreshTokenInvalidException extends UnauthorizedAppException {
  constructor() {
    super('Refresh token is missing, expired or already used', ErrorCode.REFRESH_TOKEN_INVALID);
  }
}

export class ForbiddenAppException extends AppException {
  constructor(message = 'You do not have access to this resource') {
    super(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, message);
  }
}

export class ResourceNotFoundException extends AppException {
  constructor(message = 'Resource not found', code: ErrorCode = ErrorCode.NOT_FOUND) {
    super(code, HttpStatus.NOT_FOUND, message);
  }
}

export class ResourceConflictException extends AppException {
  constructor(
    message = 'The request conflicts with the current state of the resource',
    code: ErrorCode = ErrorCode.CONFLICT,
    details?: unknown,
  ) {
    super(code, HttpStatus.CONFLICT, message, details);
  }
}

export class InsufficientStockException extends AppException {
  constructor(message = 'Not enough stock available', details?: unknown) {
    super(ErrorCode.INSUFFICIENT_STOCK, HttpStatus.CONFLICT, message, details);
  }
}

export class CartLimitExceededException extends AppException {
  constructor(message = 'Cart limit exceeded') {
    super(ErrorCode.CART_LIMIT_EXCEEDED, HttpStatus.CONFLICT, message);
  }
}

/**
 * The order cannot move to the requested status: the state machine forbids it for this caller, or
 * another request changed the order first. `currentStatus` is what the order is now.
 */
export class InvalidOrderTransitionException extends AppException {
  constructor(currentStatus: OrderStatus, requestedStatus: OrderStatus) {
    super(
      ErrorCode.INVALID_ORDER_TRANSITION,
      HttpStatus.CONFLICT,
      `An order that is ${currentStatus} cannot be changed to ${requestedStatus}`,
      { currentStatus, requestedStatus },
    );
  }
}

/** Deadlock or serialization failure: nothing was applied and the client may retry. */
export class ConcurrentUpdateException extends AppException {
  constructor() {
    super(
      ErrorCode.CONCURRENT_UPDATE,
      HttpStatus.CONFLICT,
      'The resource was modified concurrently, please retry',
    );
  }
}

export class UnsupportedMediaTypeException extends AppException {
  constructor(message = 'Unsupported media type') {
    super(ErrorCode.UNSUPPORTED_MEDIA_TYPE, HttpStatus.UNSUPPORTED_MEDIA_TYPE, message);
  }
}

export class ServiceUnavailableAppException extends AppException {
  constructor(message = 'Service temporarily unavailable', details?: unknown) {
    super(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE, message, details);
  }
}

/** Anything unexpected. The message is deliberately generic: internals are only logged. */
export class InternalErrorException extends AppException {
  constructor() {
    super(ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}
