import { useCallback, useRef } from 'react';
import { createIdempotencyKey } from '@/shared/lib/idempotency-key';

/**
 * The `Idempotency-Key` for the next submit. `purchase` says what is being bought and where it
 * goes (the cart's lines and the shipping address). While it stays the same every call returns
 * the same key, so a double click or a retry after a lost response cannot create a second order;
 * once it changes it is a different purchase and gets a new key. The server holds the same line:
 * it refuses a key that comes back with another address. (After a successful checkout the page is
 * left, so a later visit starts with a new key too.)
 */
export function useIdempotencyKey(): (purchase: string) => string {
  const attempt = useRef<{ purchase: string; key: string } | null>(null);

  return useCallback((purchase) => {
    if (attempt.current?.purchase !== purchase) {
      attempt.current = { purchase, key: createIdempotencyKey() };
    }
    return attempt.current.key;
  }, []);
}
