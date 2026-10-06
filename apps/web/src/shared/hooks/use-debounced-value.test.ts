import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './use-debounced-value';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebouncedValue', () => {
  it('follows the value only after it has been still for the delay', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(result.current).toBe('a');

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current).toBe('ab');
  });

  it('restarts the wait on every change, so only the last value arrives', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    await act(() => vi.advanceTimersByTimeAsync(200));
    rerender({ value: 'abc' });
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(result.current).toBe('a');

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current).toBe('abc');
  });
});
