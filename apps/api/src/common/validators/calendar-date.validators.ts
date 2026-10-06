import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD` naming a day that exists. The round trip through `Date` rejects `2026-02-30`,
 * which `Date` itself would silently roll over to March.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** A day as `YYYY-MM-DD`, read in UTC (the API never interprets dates in a local time zone). */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: { message: '$property must be a date in the format YYYY-MM-DD', ...options },
      validator: { validate: isCalendarDate },
    });
}

/**
 * The day must not be earlier than the one in `otherProperty` (e.g. `to` against `from`). When
 * either is missing or malformed, the check passes: that value is reported by its own validator.
 */
export function IsNotBeforeDate(
  otherProperty: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isNotBeforeDate',
      target: target.constructor,
      propertyName: String(propertyKey),
      constraints: [otherProperty],
      options: { message: `$property must not be earlier than ${otherProperty}`, ...options },
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [other] = args.constraints as [string];
          const earliest = (args.object as Record<string, unknown>)[other];
          if (!isCalendarDate(value) || !isCalendarDate(earliest)) return true;
          // Zero-padded ISO dates sort the same as chronologically.
          return value >= earliest;
        },
      },
    });
}
