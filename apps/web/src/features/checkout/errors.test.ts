import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { getCheckoutErrorMessage, shouldRefreshCart } from './errors';

function apiError(status: number, code: string, message = `${code} message`) {
  return new ApiError({ status, code, message });
}

describe('getCheckoutErrorMessage', () => {
  it('names the product that ran out and sends the customer to the cart', () => {
    const error = apiError(409, 'INSUFFICIENT_STOCK', 'Not enough stock for "Wireless Mouse"');

    expect(getCheckoutErrorMessage(error)).toBe(
      'Not enough stock for "Wireless Mouse". Review your cart and try again.',
    );
  });

  it('explains an empty cart', () => {
    expect(getCheckoutErrorMessage(apiError(409, 'CART_EMPTY'))).toBe(
      'Your cart is empty. Add something to it before checking out.',
    );
  });

  it('explains an archived product without showing the API wording', () => {
    expect(getCheckoutErrorMessage(apiError(409, 'PRODUCT_UNAVAILABLE'))).toBe(
      'A product in your cart is no longer available. Remove it from your cart and try again.',
    );
  });

  it('asks to press Pay again after a deadlock-style conflict', () => {
    expect(getCheckoutErrorMessage(apiError(409, 'CONCURRENT_UPDATE'))).toBe(
      'The shop is busy right now. Please press Pay again.',
    );
  });

  it('shows the API message of any other refusal', () => {
    expect(getCheckoutErrorMessage(apiError(403, 'FORBIDDEN'))).toBe(
      'You do not have permission to do that.',
    );
    expect(getCheckoutErrorMessage(apiError(429, 'TOO_MANY_REQUESTS'))).toBe(
      'Too many attempts. Please wait a moment and try again.',
    );
  });

  it.each([
    ['a lost connection', new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' })],
    ['a server error', apiError(500, 'INTERNAL_ERROR', 'boom: stack trace')],
    ['something that is not an API error', new TypeError('oops')],
  ])('says the outcome is unknown, and that retrying is safe, after %s', (_name, error) => {
    const message = getCheckoutErrorMessage(error);

    expect(message).toContain('could not confirm your order');
    expect(message).toContain('will not create a duplicate');
    expect(message).not.toContain('stack trace');
  });
});

describe('shouldRefreshCart', () => {
  it('reloads the cart when the server refused it', () => {
    expect(shouldRefreshCart(apiError(409, 'INSUFFICIENT_STOCK'))).toBe(true);
    expect(shouldRefreshCart(apiError(409, 'CART_EMPTY'))).toBe(true);
    expect(shouldRefreshCart(apiError(409, 'PRODUCT_UNAVAILABLE'))).toBe(true);
  });

  it('keeps the cart when the order may exist (lost response, server error) or the cart is fine', () => {
    expect(shouldRefreshCart(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' }))).toBe(
      false,
    );
    expect(shouldRefreshCart(apiError(500, 'INTERNAL_ERROR'))).toBe(false);
    expect(shouldRefreshCart(apiError(409, 'CONCURRENT_UPDATE'))).toBe(false);
    expect(shouldRefreshCart(apiError(400, 'VALIDATION_FAILED'))).toBe(false);
  });
});
