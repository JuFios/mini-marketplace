import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts in favour of the last one. Without the merge,
 * a caller's `className="w-full"` would only win or lose by the order of the generated CSS.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes);
}
