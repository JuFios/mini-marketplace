import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIdempotencyKey } from './use-idempotency-key';

describe('useIdempotencyKey', () => {
  it('gives the same key to every submit of the same purchase', () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current('a:1|12 Main Street');

    expect(result.current('a:1|12 Main Street')).toBe(first);
    expect(result.current('a:1|12 Main Street')).toBe(first);
  });

  it('keeps the key across renders', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const first = result.current('a:1|12 Main Street');

    rerender();

    expect(result.current('a:1|12 Main Street')).toBe(first);
  });

  it('gives a new key once the cart has changed', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const first = result.current('a:1|12 Main Street');

    const second = result.current('a:2|12 Main Street');

    expect(second).not.toBe(first);
    expect(result.current('a:2|12 Main Street')).toBe(second);
  });

  it('gives a new key once the address has changed', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const first = result.current('a:1|12 Main Street');

    const second = result.current('a:1|99 Other Road');

    expect(second).not.toBe(first);
    expect(result.current('a:1|99 Other Road')).toBe(second);
  });

  it('gives a new key for every visit (every mount)', () => {
    const first = renderHook(() => useIdempotencyKey()).result.current('a:1|12 Main Street');
    const second = renderHook(() => useIdempotencyKey()).result.current('a:1|12 Main Street');

    expect(second).not.toBe(first);
  });
});
