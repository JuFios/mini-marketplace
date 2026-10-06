import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import type { Cart } from '@/shared/api/types';
import { deferred } from '@/test/fake-api';
import { cart, cartItem, MOUSE } from '@/test/fixtures';
import * as api from './api';
import { cartKeys, useAddCartItem, useSetCartItemQuantity } from './queries';

vi.mock('./api');
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// 19.99 × 1 = 19.99
const oneMouse = cart([cartItem(MOUSE, 1)], { subtotal: '19.99' });

function setup(initial?: Cart) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (initial) queryClient.setQueryData(cartKeys.all, initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const cached = () => queryClient.getQueryData<Cart>(cartKeys.all);
  return { queryClient, wrapper, cached };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('adding to the cart', () => {
  it('shows the new cart at once, before the server has answered', async () => {
    const { wrapper, cached } = setup(oneMouse);
    vi.mocked(api.addCartItem).mockReturnValue(deferred<Cart>().promise);
    const { result } = renderHook(() => useAddCartItem(), { wrapper });

    act(() => result.current.mutate({ product: MOUSE, quantity: 2 }));

    // 3 × 19.99 = 59.97
    await waitFor(() => expect(cached()).toMatchObject({ totalQuantity: 3, subtotal: '59.97' }));
    expect(api.addCartItem).toHaveBeenCalledWith(MOUSE.id, 2);
  });

  it('replaces the prediction with the cart the server returns', async () => {
    const { wrapper, cached } = setup(oneMouse);
    // The price went down meanwhile: 3 × 18.99 = 56.97, which only the server knows.
    const serverCart = cart([cartItem({ ...MOUSE, price: '18.99' }, 3)], { subtotal: '56.97' });
    const reply = deferred<Cart>();
    vi.mocked(api.addCartItem).mockReturnValue(reply.promise);
    const { result } = renderHook(() => useAddCartItem(), { wrapper });

    act(() => result.current.mutate({ product: MOUSE, quantity: 2 }));
    await waitFor(() => expect(cached()?.subtotal).toBe('59.97'));
    reply.resolve(serverCart);

    await waitFor(() => expect(cached()).toEqual(serverCart));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Wireless Mouse'));
  });

  it('puts the old cart back and says why when the server refuses (409)', async () => {
    const { wrapper, cached, queryClient } = setup(oneMouse);
    vi.mocked(api.addCartItem).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for "Wireless Mouse"',
      }),
    );
    const { result } = renderHook(() => useAddCartItem(), { wrapper });

    act(() => result.current.mutate({ product: MOUSE, quantity: 50 }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Not enough stock for "Wireless Mouse"'),
    );
    expect(cached()).toEqual(oneMouse);
    // Nothing is mounted to refetch, but the cart must be marked for reconciliation.
    expect(queryClient.getQueryState(cartKeys.all)?.isInvalidated).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('predicts nothing without a loaded cart, and takes the server cart when it arrives', async () => {
    const { wrapper, cached } = setup();
    const serverCart = cart([cartItem(MOUSE, 1)], { subtotal: '19.99' });
    const reply = deferred<Cart>();
    vi.mocked(api.addCartItem).mockReturnValue(reply.promise);
    const { result } = renderHook(() => useAddCartItem(), { wrapper });

    act(() => result.current.mutate({ product: MOUSE, quantity: 1 }));
    expect(cached()).toBeUndefined();

    reply.resolve(serverCart);
    await waitFor(() => expect(cached()).toEqual(serverCart));
  });
});

describe('several changes in a row', () => {
  it('runs them one after another, showing each at once, and ends on the server state', async () => {
    const { wrapper, cached } = setup(oneMouse);
    const first = deferred<Cart>();
    const second = deferred<Cart>();
    vi.mocked(api.setCartItemQuantity)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useSetCartItemQuantity(), { wrapper });

    act(() => result.current.mutate({ productId: MOUSE.id, quantity: 2 }));
    act(() => result.current.mutate({ productId: MOUSE.id, quantity: 3 }));

    // Both are on screen already; only the first request has gone out.
    await waitFor(() => expect(cached()?.totalQuantity).toBe(3));
    expect(api.setCartItemQuantity).toHaveBeenCalledTimes(1);
    expect(api.setCartItemQuantity).toHaveBeenLastCalledWith(MOUSE.id, 2);

    // The first answer must not undo the second change, which is still on its way.
    first.resolve(cart([cartItem(MOUSE, 2)], { subtotal: '39.98' }));
    await waitFor(() => expect(api.setCartItemQuantity).toHaveBeenCalledTimes(2));
    expect(api.setCartItemQuantity).toHaveBeenLastCalledWith(MOUSE.id, 3);
    expect(cached()?.totalQuantity).toBe(3);

    const final = cart([cartItem(MOUSE, 3)], { subtotal: '59.97' });
    second.resolve(final);
    await waitFor(() => expect(cached()).toEqual(final));
  });

  it('when the last one fails, restores the state before it and reconciles', async () => {
    const { wrapper, cached, queryClient } = setup(oneMouse);
    const first = deferred<Cart>();
    vi.mocked(api.setCartItemQuantity)
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(
        new ApiError({ status: 409, code: 'INSUFFICIENT_STOCK', message: 'Not enough stock' }),
      );
    const { result } = renderHook(() => useSetCartItemQuantity(), { wrapper });

    act(() => result.current.mutate({ productId: MOUSE.id, quantity: 2 }));
    act(() => result.current.mutate({ productId: MOUSE.id, quantity: 30 }));
    first.resolve(cart([cartItem(MOUSE, 2)], { subtotal: '39.98' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not enough stock'));
    expect(queryClient.getQueryState(cartKeys.all)?.isInvalidated).toBe(true);
    // Never the unreachable quantity of 30.
    expect(cached()?.totalQuantity).not.toBe(30);
  });
});
