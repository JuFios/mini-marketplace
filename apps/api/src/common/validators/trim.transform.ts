import type { TransformFnParams } from 'class-transformer';

/**
 * `@Transform` callback that trims string input before validation, so length rules see the real
 * content. Other values pass through untouched for the property's own validators to reject.
 */
export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
