import { registerDecorator, ValidationOptions } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';

const PRICE_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;
const MAX_PRICE = '1000000.00';

/** A decimal string usable as a price bound: zero is allowed (unlike a product price). */
export function IsPriceFilter(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isPriceFilter',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: {
        message: `$property must be a decimal string between 0 and ${MAX_PRICE} with at most 2 fraction digits`,
        ...options,
      },
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' &&
            PRICE_PATTERN.test(value) &&
            new Prisma.Decimal(value).lte(MAX_PRICE)
          );
        },
      },
    });
}
