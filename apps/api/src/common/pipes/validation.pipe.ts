import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ValidationErrorDetail, ValidationFailedException } from '../exceptions/app.exception';

/** Flattens class-validator's error tree into one entry per field, with dotted paths. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    // Unknown properties are rejected, not silently dropped: a typo in a field name must not
    // look like a successful request.
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationFailedException(flattenValidationErrors(errors)),
  });
}
