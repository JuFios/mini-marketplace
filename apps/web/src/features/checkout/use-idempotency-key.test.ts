import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIdempotencyKey } from './use-idempotency-key';

describe('useIdempotencyKey', () => {
  it('gives the same key to every submit while the cart is unchanged', () => {
    const { result } = renderHook(() => useIdempotencyKey('a:1'));

    const first = result.current();

    expect(result.current()).toBe(first);
    expect(result.current()).toBe(first);
  });

  it('keeps the key across renders that do not change the cart', () => {
    const { result, rerender } = renderHook(({ cart }) => useIdempotencyKey(cart), {
      initialProps: { cart: 'a:1' },
    });
    const first = result.current();

    rerender({ cart: 'a:1' });

    expect(result.current()).toBe(first);
  });

  it('gives a new key once the cart has changed', () => {
    const { result, rerender } = renderHook(({ cart }) => useIdempotencyKey(cart), {
      initialProps: { cart: 'a:1' },
    });
    const first = result.current();

    rerender({ cart: 'a:2' });
    const second = result.current();

    expect(second).not.toBe(first);
    expect(result.current()).toBe(second);
  });

  it('gives a new key for every visit (every mount)', () => {
    const first = renderHook(() => useIdempotencyKey('a:1')).result.current();
    const second = renderHook(() => useIdempotencyKey('a:1')).result.current();

    expect(second).not.toBe(first);
  });
});
