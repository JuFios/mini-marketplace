import { getErrorMessage } from '@/shared/api/error-messages';
import { hasErrorCode } from '@/shared/api/errors';

export function getCancelErrorMessage(error: unknown): string {
  // The order moved on (shipped, or the worker finished its payment) between the page and the click.
  if (hasErrorCode(error, 'INVALID_ORDER_TRANSITION')) {
    return 'This order can no longer be cancelled. Its status has changed.';
  }
  return getErrorMessage(error);
}
