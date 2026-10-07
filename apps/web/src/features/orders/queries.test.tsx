import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogKeys } from '@/features/catalog/queries';
import { ApiError } from '@/shared/api/errors';
import { ORDER_ID, order } from '@/test/fixtures';
import * as api from './api';
import { orderKeys, useCancelOrder, useOrderQuery } from './queries';

vi.mock('./api');
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Real timers, shrunk: Vitest's fake timers do not mix with Testing Library's waiting. The window
// is long where a test is about the status changing (a loaded machine must not end the polling
// first) and short only where the window itself is under test.
const FAST = { intervalMs: 15, windowMs: 5_000 };
const SHORT_WINDOW = { intervalMs: 15, windowMs: 120 };
const sleep = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const waiting = order({ status: 'NEW', paymentStatus: 'PENDING' });
const paid = order({ status: 'PROCESSING', paymentStatus: 'PAID' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('watching an order', () => {
  it('asks again while the order is NEW and stops once its status has changed', async () => {
    const { wrapper } = setup();
    vi.mocked(api.fetchOrder)
      .mockResolvedValueOnce(waiting)
      .mockResolvedValueOnce(waiting)
      .mockResolvedValue(paid);
    const { result } = renderHook(() => useOrderQuery(ORDER_ID, FAST), { wrapper });

    await waitFor(() => expect(result.current.query.data?.status).toBe('PROCESSING'));
    const callsWhenChanged = vi.mocked(api.fetchOrder).mock.calls.length;
    expect(callsWhenChanged).toBe(3);

    // Many intervals later nothing more has been asked.
    await sleep(FAST.intervalMs * 6);
    expect(api.fetchOrder).toHaveBeenCalledTimes(callsWhenChanged);
    expect(result.current.pollingTimedOut).toBe(false);
  });

  it('gives up after the window and says the payment result is overdue', async () => {
    const { wrapper } = setup();
    vi.mocked(api.fetchOrder).mockResolvedValue(waiting);
    const { result } = renderHook(() => useOrderQuery(ORDER_ID, SHORT_WINDOW), { wrapper });

    await waitFor(() => expect(result.current.pollingTimedOut).toBe(true));
    const callsWhenGivenUp = vi.mocked(api.fetchOrder).mock.calls.length;
    // The first answer plus at most window ÷ interval more, never an unbounded number.
    expect(callsWhenGivenUp).toBeGreaterThanOrEqual(1);
    expect(callsWhenGivenUp).toBeLessThanOrEqual(12);

    await sleep(SHORT_WINDOW.intervalMs * 6);
    expect(api.fetchOrder).toHaveBeenCalledTimes(callsWhenGivenUp);
  });

  it('does not ask again about an order that is already past NEW', async () => {
    const { wrapper } = setup();
    vi.mocked(api.fetchOrder).mockResolvedValue(paid);
    const { result } = renderHook(() => useOrderQuery(ORDER_ID, FAST), { wrapper });

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await sleep(FAST.intervalMs * 6);

    expect(api.fetchOrder).toHaveBeenCalledTimes(1);
  });

  it('starts from the order the checkout left in the cache, without a spinner', async () => {
    const { wrapper, queryClient } = setup();
    queryClient.setQueryData(orderKeys.detail(ORDER_ID), waiting);
    vi.mocked(api.fetchOrder).mockResolvedValue(paid);

    const { result } = renderHook(() => useOrderQuery(ORDER_ID, FAST), { wrapper });

    expect(result.current.query.data).toEqual(waiting);
    await waitFor(() => expect(result.current.query.data?.status).toBe('PROCESSING'));
  });
});

describe('cancelling an order', () => {
  const cancelled = order({
    status: 'CANCELLED',
    paymentStatus: 'VOIDED',
    cancelReason: 'CUSTOMER_REQUEST',
    allowedTransitions: [],
  });

  it('shows the cancelled order and marks the lists and the catalog out of date (stock is back)', async () => {
    const { wrapper, queryClient } = setup();
    const catalogKey = [...catalogKeys.products, 'list', 'any'];
    const listKey = [...orderKeys.lists, 'any'];
    queryClient.setQueryData(catalogKey, { items: [] });
    queryClient.setQueryData(listKey, { items: [] });
    queryClient.setQueryData(orderKeys.detail(ORDER_ID), waiting);
    vi.mocked(api.cancelOrder).mockResolvedValue(cancelled);
    const { result } = renderHook(() => useCancelOrder(), { wrapper });

    act(() => result.current.mutate(ORDER_ID));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Order cancelled'));
    expect(api.cancelOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(queryClient.getQueryData(orderKeys.detail(ORDER_ID))).toEqual(cancelled);
    expect(queryClient.getQueryState(catalogKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('says the order moved on when the server refuses, and reloads it', async () => {
    const { wrapper, queryClient } = setup();
    queryClient.setQueryData(orderKeys.detail(ORDER_ID), waiting);
    vi.mocked(api.cancelOrder).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'INVALID_ORDER_TRANSITION',
        message: 'Order cannot move from SHIPPED to CANCELLED',
      }),
    );
    const { result } = renderHook(() => useCancelOrder(), { wrapper });

    act(() => result.current.mutate(ORDER_ID));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This order can no longer be cancelled. Its status has changed.',
      ),
    );
    expect(queryClient.getQueryState(orderKeys.detail(ORDER_ID))?.isInvalidated).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
