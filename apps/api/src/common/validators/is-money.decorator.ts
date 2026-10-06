import { registerDecorator, ValidationOptions } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';

const MONEY_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;

/**
 * A decimal string with at most two fraction digits, greater than zero and not above `max`.
 * Money travels as a string so no float ever touches it; numbers are rejected on purpose.
 */
export function IsMoney(max: string, options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isMoney',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: {
        message: `$property must be a decimal string between 0.01 and ${max} with at most 2 fraction digits`,
        ...options,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) return false;
          const amount = new Prisma.Decimal(value);
          return amount.gt(0) && amount.lte(max);
        },
      },
    });
}
