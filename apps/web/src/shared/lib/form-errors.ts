import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { getFieldErrors } from '@/shared/api/errors';

/**
 * Puts the API's per-field validation messages (`VALIDATION_FAILED`) on the matching form fields.
 * Returns whether any field took one; if none did, the caller shows the error on the form as a whole.
 */
export function applyFieldErrors<TValues extends FieldValues>(
  error: unknown,
  fields: readonly Path<TValues>[],
  setError: UseFormSetError<TValues>,
): boolean {
  let applied = false;
  for (const { field, message } of getFieldErrors(error)) {
    const match = fields.find((candidate) => candidate === field);
    if (match) {
      setError(match, { type: 'server', message });
      applied = true;
    }
  }
  return applied;
}
