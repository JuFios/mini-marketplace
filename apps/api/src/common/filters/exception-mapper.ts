import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AppException,
  CartLimitExceededException,
  ConcurrentUpdateException,
  InsufficientStockException,
  InternalErrorException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';
import { readDatabaseError, SqlState } from './database-error';

// CHECK constraints from the initial migration whose violation has a dedicated client error.
// Any other violated CHECK constraint means a code path bypassed validation: that is a bug and
// stays a 500.
const CHECK_CONSTRAINT_EXCEPTIONS: Readonly<Record<string, () => AppException>> = {
  products_stock_non_negative: () => new InsufficientStockException(),
  cart_items_quantity_range: () => new CartLimitExceededException(),
};

const STATUS_CODES: Readonly<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

// Fixed texts: the body parser's own messages describe the offending payload.
const PARSER_ERROR_MESSAGES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Malformed request body',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Request body is too large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported content type, charset or encoding',
};

// A plain number: `HttpException#getStatus()` returns one, and comparing it with the enum
// member directly is rejected by the type-aware lint rules.
const SERVICE_UNAVAILABLE: number = HttpStatus.SERVICE_UNAVAILABLE;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function codeForStatus(status: number): ErrorCode {
  return STATUS_CODES[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
}

function readHttpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (isRecord(response) && Array.isArray(response.message)) {
    return response.message.map(String).join('; ');
  }
  return exception.message;
}

function fromHttpException(exception: HttpException): AppException {
  const status = exception.getStatus();
  // 5xx messages are written by arbitrary code; only the explicit 503 is safe to pass through.
  if (status >= 500 && status !== SERVICE_UNAVAILABLE) return new InternalErrorException();
  return new AppException(codeForStatus(status), status, readHttpExceptionMessage(exception));
}

/** Errors raised by the body parser (malformed JSON, oversized payload) are plain `http-errors`. */
function fromParserError(exception: unknown): AppException | undefined {
  if (!isRecord(exception) || exception.expose !== true) return undefined;
  const { status } = exception;
  if (typeof status !== 'number' || status < 400 || status >= 500) return undefined;
  return new AppException(
    codeForStatus(status),
    status,
    PARSER_ERROR_MESSAGES[status] ?? 'Invalid request',
  );
}

function fromDatabaseError(exception: unknown): AppException | undefined {
  const error = readDatabaseError(exception);
  if (!error) return undefined;
  const { prismaCode, sqlState, checkConstraint } = error;

  if (prismaCode === 'P2025') return new ResourceNotFoundException();
  if (prismaCode === 'P2034') return new ConcurrentUpdateException();
  if (prismaCode === 'P2002' || sqlState === SqlState.UNIQUE_VIOLATION) {
    return new ResourceConflictException('A resource with these values already exists');
  }
  if (prismaCode === 'P2003' || sqlState === SqlState.FOREIGN_KEY_VIOLATION) {
    return new ResourceConflictException('The resource is referenced by, or refers to, another');
  }
  if (sqlState === SqlState.DEADLOCK_DETECTED || sqlState === SqlState.SERIALIZATION_FAILURE) {
    return new ConcurrentUpdateException();
  }
  if (sqlState === SqlState.CHECK_VIOLATION && checkConstraint) {
    return CHECK_CONSTRAINT_EXCEPTIONS[checkConstraint]?.();
  }
  return undefined;
}

/**
 * Translates any thrown value into the `AppException` that is sent to the client. Anything not
 * recognised becomes a generic 500, so internal details never leave the process.
 */
export function toAppException(exception: unknown): AppException {
  if (exception instanceof AppException) return exception;
  if (exception instanceof HttpException) return fromHttpException(exception);
  return fromDatabaseError(exception) ?? fromParserError(exception) ?? new InternalErrorException();
}
