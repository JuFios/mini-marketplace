import { HttpStatus } from '@nestjs/common';
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
