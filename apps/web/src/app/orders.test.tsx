import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cartApi from '@/features/cart/api';
import * as catalogApi from '@/features/catalog/api';
import * as ordersApi from '@/features/orders/api';
import { orderKeys } from '@/features/orders/queries';
import { ApiError } from '@/shared/api/errors';
import type { Order } from '@/shared/api/types';
import { ADMIN, CUSTOMER, deferred } from '@/test/fake-api';
import {
  EMPTY_CART,
  ORDER_ID,
  ORDER_NUMBER,
  order,
  orderSummary,
  ordersPage,
} from '@/test/fixtures';
import { renderApp } from '@/test/render-app';

vi.mock('@/features/cart/api');
vi.mock('@/features/catalog/api');
vi.mock('@/features/orders/api');
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const fetchOrders = vi.mocked(ordersApi.fetchOrders);
const fetchOrder = vi.mocked(ordersApi.fetchOrder);
const cancelOrder = vi.mocked(ordersApi.cancelOrder);

const lastListQuery = () => fetchOrders.mock.lastCall?.[0];

function apiError(status: number, code: string, message = `${code} message`) {
  return new ApiError({ status, code, message, requestId: 'req-9' });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(cartApi.fetchCart).mockResolvedValue(EMPTY_CART);
  vi.mocked(catalogApi.fetchProducts).mockResolvedValue({
    items: [],
    meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
  });
  vi.mocked(catalogApi.fetchCategories).mockResolvedValue([]);
});

describe('the order list', () => {
  const other = orderSummary({
    id: '9d8c7b6a-1111-4222-8333-444455556666',
    status: 'CANCELLED',
    paymentStatus: 'VOIDED',
    totalAmount: '19.99',
    itemsCount: 1,
    createdAt: '2026-10-04T12:00:00.000Z',
  });

  it('lists the orders with number, date, status, size and total', async () => {
    fetchOrders.mockResolvedValue(ordersPage([orderSummary(), other]));
    renderApp('/orders', CUSTOMER);

    const link = await screen.findByRole('link', { name: new RegExp(`Order ${ORDER_NUMBER}`) });

    expect(link).toHaveAttribute('href', `/orders/${ORDER_ID}`);
    expect(within(link).getByText('Processing')).toBeInTheDocument();
    expect(within(link).getByText('$129.48')).toBeInTheDocument();
    expect(within(link).getByText(/Oct \d{1,2}, 2026, .+ · 2 products$/)).toBeInTheDocument();
    const second = screen.getByRole('link', { name: /Order #9D8C7B6A/ });
    expect(within(second).getByText('Cancelled')).toBeInTheDocument();
    expect(within(second).getByText(/· 1 product$/)).toBeInTheDocument();
    expect(screen.getByText('2 orders')).toBeInTheDocument();
  });

  it('reads the status and page from the URL', async () => {
    fetchOrders.mockResolvedValue(ordersPage([other], { page: 2, total: 11, totalPages: 2 }));
    renderApp('/orders?status=CANCELLED&page=2', CUSTOMER);

    await screen.findByRole('link', { name: /Order #9D8C7B6A/ });

    expect(lastListQuery()).toEqual({ status: 'CANCELLED', page: 2 });
    expect(screen.getByLabelText('Status')).toHaveValue('CANCELLED');
  });

  it('filters by status, starting over from page 1', async () => {
    fetchOrders.mockResolvedValue(ordersPage([orderSummary()]));
    const { router } = renderApp('/orders?page=3', CUSTOMER);
    await screen.findByRole('link', { name: /Order #/ });

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Shipped');

    await waitFor(() => expect(lastListQuery()).toEqual({ status: 'SHIPPED', page: 1 }));
    expect(router.state.location.search).toBe('?status=SHIPPED');
  });

  it('pages through the orders, and the back button returns to the previous page', async () => {
    fetchOrders.mockResolvedValue(ordersPage([orderSummary()], { total: 25, totalPages: 3 }));
    const { router } = renderApp('/orders', CUSTOMER);
    await screen.findByRole('link', { name: /Order #/ });

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() => expect(lastListQuery()).toMatchObject({ page: 2 }));
    expect(router.state.location.search).toBe('?page=2');

    await act(() => router.navigate(-1));
    await waitFor(() => expect(lastListQuery()).toMatchObject({ page: 1 }));
  });

  it('invites a customer without orders to the catalog', async () => {
    fetchOrders.mockResolvedValue(ordersPage([]));
    renderApp('/orders', CUSTOMER);

    expect(await screen.findByText('You have not placed any orders yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/');
  });

  it('says so when no order has the chosen status, with a way back to all of them', async () => {
    fetchOrders.mockResolvedValue(ordersPage([]));
    const { router } = renderApp('/orders?status=SHIPPED', CUSTOMER);

    expect(await screen.findByText('No orders with this status')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all orders' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('says a page past the end does not exist, keeping the status filter', async () => {
    fetchOrders.mockResolvedValue(ordersPage([], { page: 9, total: 4, totalPages: 1 }));
    const { router } = renderApp('/orders?status=SHIPPED&page=9', CUSTOMER);

    expect(await screen.findByText('There is no page 9')).toBeInTheDocument();
    expect(screen.getByText('This list has only one page.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to the first page' }));

    await waitFor(() => expect(router.state.location.search).toBe('?status=SHIPPED'));
  });

  it('shows the error with a retry', async () => {
    fetchOrders.mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR', 'boom'));
    fetchOrders.mockResolvedValue(ordersPage([orderSummary()]));
    renderApp('/orders', CUSTOMER);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('Reference: req-9')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: /Order #/ })).toBeInTheDocument();
  });

  it('is linked from the header for a customer', async () => {
    renderApp('/', CUSTOMER);

    expect(await screen.findByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/orders');
  });

  it('is not offered to an administrator', async () => {
    renderApp('/', ADMIN);

    await screen.findByRole('link', { name: 'Admin' });
    expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
  });

  it('is not offered to a visitor', async () => {
    renderApp('/');

    await screen.findByRole('link', { name: 'Log in' });
    expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
  });
});

describe('an order page', () => {
  it('shows the order: items, total, payment, address and date', async () => {
    fetchOrder.mockResolvedValue(order({ status: 'PROCESSING', paymentStatus: 'PAID' }));
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    expect(
      await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` }),
    ).toBeInTheDocument();
    expect(fetchOrder).toHaveBeenCalledWith(ORDER_ID, expect.anything());

    const items = within(screen.getByRole('region', { name: 'Items' }));
    expect(items.getByText('Mechanical Keyboard')).toBeInTheDocument();
    // One keyboard: the unit price and the line total are the same amount.
    expect(items.getAllByText('$89.50')).toHaveLength(2);
    expect(items.getByText('Wireless Mouse')).toBeInTheDocument();
    expect(items.getByText('$39.98')).toBeInTheDocument();
    expect(screen.getByText('$129.48')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText(/12 Main Street/)).toBeInTheDocument();
    expect(screen.getByText(/Placed Oct \d{1,2}, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← My orders' })).toHaveAttribute('href', '/orders');
  });

  it.each([
    ['is still being charged', order(), 'Confirming your payment…'],
    ['was paid', order({ status: 'PROCESSING', paymentStatus: 'PAID' }), 'Payment received'],
    [
      'was declined',
      order({
        status: 'CANCELLED',
        paymentStatus: 'FAILED',
        cancelReason: 'PAYMENT_FAILED',
        allowedTransitions: [],
      }),
      'Payment was declined',
    ],
  ])('tells the customer when the payment %s', async (_name, shown, headline) => {
    fetchOrder.mockResolvedValue(shown);
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    expect(await screen.findByText(headline)).toBeInTheDocument();
  });

  it('shows the payment result as soon as the worker has produced it', async () => {
    // The checkout page left the order as NEW; the next answer says PROCESSING.
    fetchOrder.mockResolvedValue(order({ status: 'PROCESSING', paymentStatus: 'PAID' }));
    const { queryClient } = renderApp(`/orders/${ORDER_ID}`, CUSTOMER);
    queryClient.setQueryData(orderKeys.detail(ORDER_ID), order());

    expect(await screen.findByText('Payment received')).toBeInTheDocument();
    expect(screen.queryByText('Confirming your payment…')).not.toBeInTheDocument();
  });

  it('says there is no such order for an unknown or foreign one', async () => {
    fetchOrder.mockRejectedValue(apiError(404, 'ORDER_NOT_FOUND'));
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    expect(await screen.findByText('Order not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute('href', '/orders');
  });

  it('says there is no such order for a malformed id too', async () => {
    fetchOrder.mockRejectedValue(apiError(400, 'VALIDATION_FAILED'));
    renderApp('/orders/not-a-uuid', CUSTOMER);

    expect(await screen.findByText('Order not found')).toBeInTheDocument();
  });

  it('shows the error with a retry for any other failure', async () => {
    fetchOrder.mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR'));
    fetchOrder.mockResolvedValue(order());
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` }),
    ).toBeInTheDocument();
  });
});

describe('cancelling', () => {
  const cancelled = order({
    status: 'CANCELLED',
    paymentStatus: 'VOIDED',
    cancelReason: 'CUSTOMER_REQUEST',
    allowedTransitions: [],
  });

  it('asks first, and only then cancels and shows the result', async () => {
    fetchOrder.mockResolvedValue(order());
    cancelOrder.mockResolvedValue(cancelled);
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/You will not be charged/)).toBeInTheDocument();
    expect(cancelOrder).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }));

    expect(await screen.findByText('Order cancelled', { selector: 'p' })).toBeInTheDocument();
    expect(cancelOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(toast.success).toHaveBeenCalledWith('Order cancelled');
    // Nothing is left to cancel.
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    expect(screen.getByText('Not charged')).toBeInTheDocument();
  });

  it('promises a refund when the order has been paid', async () => {
    fetchOrder.mockResolvedValue(order({ status: 'PROCESSING', paymentStatus: 'PAID' }));
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));

    expect(within(screen.getByRole('dialog')).getByText(/payment is refunded/)).toBeInTheDocument();
  });

  it('does nothing when the customer keeps the order', async () => {
    fetchOrder.mockResolvedValue(order());
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep order' }),
    );

    expect(cancelOrder).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is busy while the request is in flight', async () => {
    fetchOrder.mockResolvedValue(order());
    const reply = deferred<Order>();
    cancelOrder.mockReturnValue(reply.promise);
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel order' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDisabled(),
    );

    reply.resolve(cancelled);
    expect(await screen.findByText('Order cancelled', { selector: 'p' })).toBeInTheDocument();
  });

  it.each(['SHIPPED', 'COMPLETED'] as const)(
    'is not offered once the order is %s',
    async (status) => {
      fetchOrder.mockResolvedValue(
        order({ status, paymentStatus: 'PAID', allowedTransitions: [] }),
      );
      renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

      await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` });

      expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    },
  );

  it('follows allowedTransitions, not the status', async () => {
    // A NEW order the server says cannot be cancelled by this caller.
    fetchOrder.mockResolvedValue(order({ allowedTransitions: [] }));
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` });

    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });

  it('says the order moved on when it shipped meanwhile, and shows where it is now', async () => {
    fetchOrder
      .mockResolvedValueOnce(order({ status: 'PROCESSING', paymentStatus: 'PAID' }))
      .mockResolvedValue(
        order({ status: 'SHIPPED', paymentStatus: 'PAID', allowedTransitions: [] }),
      );
    cancelOrder.mockRejectedValue(apiError(409, 'INVALID_ORDER_TRANSITION'));
    renderApp(`/orders/${ORDER_ID}`, CUSTOMER);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel order' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This order can no longer be cancelled. Its status has changed.',
      ),
    );
    expect(await screen.findByText('Your order has been shipped')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });
});
