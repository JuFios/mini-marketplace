import { useCallback, useRef } from 'react';
import { createIdempotencyKey } from '@/shared/lib/idempotency-key';

/**
 * The `Idempotency-Key` for the next submit. While the cart is unchanged every call returns the
 * same key, so a double click or a retry after a lost response cannot create a second order;
 * once the cart changes (`cartFingerprint`) it is a different purchase and gets a new key. (After
 * a successful checkout the page is left, so a later visit starts with a new key too.)
 */
export function useIdempotencyKey(cartFingerprint: string): () => string {
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  return useCallback(() => {
    if (attempt.current?.fingerprint !== cartFingerprint) {
      attempt.current = { fingerprint: cartFingerprint, key: createIdempotencyKey() };
    }
    return attempt.current.key;
  }, [cartFingerprint]);
}
