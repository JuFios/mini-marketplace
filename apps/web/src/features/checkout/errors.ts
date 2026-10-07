import { getErrorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/errors';

// The cart is read-only on the checkout page, so every refusal sends the customer back to it.
const REFUSALS: Record<string, string | undefined> = {
  CART_EMPTY: 'Your cart is empty. Add something to it before checking out.',
  PRODUCT_UNAVAILABLE:
    'A product in your cart is no longer available. Remove it from your cart and try again.',
  CONCURRENT_UPDATE: 'The shop is busy right now. Please press Pay again.',
};

/** The API answered and said no: nothing was ordered. Anything else leaves the outcome unknown. */
function isRefusal(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** What to tell the customer about a failed checkout. */
export function getCheckoutErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INSUFFICIENT_STOCK') {
      // The API names the product; the cart shows how many are left.
      return `${error.message}. Review your cart and try again.`;
    }
    const refusal = REFUSALS[error.code];
    if (refusal) return refusal;
  }
  if (isRefusal(error)) return getErrorMessage(error);
  // The request may have reached the server before the connection or the server failed. Pressing
  // Pay again is safe: the same Idempotency-Key cannot create a second order.
  return 'We could not confirm your order. Press Pay again: it will not create a duplicate. If the problem continues, check My orders.';
}

/** Whether the cart on screen is probably out of date after this error, so it should be reloaded. */
export function shouldRefreshCart(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    ['INSUFFICIENT_STOCK', 'CART_EMPTY', 'PRODUCT_UNAVAILABLE'].includes(error.code)
  );
}
