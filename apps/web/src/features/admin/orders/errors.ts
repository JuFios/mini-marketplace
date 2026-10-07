import { getErrorMessage } from '@/shared/api/error-messages';
import { hasErrorCode } from '@/shared/api/errors';

export function getStatusChangeErrorMessage(error: unknown): string {
  // The customer or the worker got there first; the order is reloaded to show where it is now.
  if (hasErrorCode(error, 'INVALID_ORDER_TRANSITION')) {
    return 'The order changed in the meantime and cannot take that step. It has been refreshed.';
  }
  return getErrorMessage(error);
}
