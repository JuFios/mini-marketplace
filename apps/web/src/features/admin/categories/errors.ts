import { getErrorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/errors';

const MESSAGES: Record<string, string | undefined> = {
  CATEGORY_NAME_TAKEN: 'A category with this name already exists.',
  CATEGORY_IN_USE:
    'This category still has products (archived ones count too). Move or delete them first.',
};

export function getCategoryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const known = MESSAGES[error.code];
    if (known) return known;
  }
  return getErrorMessage(error);
}
