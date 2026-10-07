import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ordersApi from '@/features/admin/orders/api';
import * as productsApi from '@/features/admin/products/api';
import { ApiError } from '@/shared/api/errors';
import { ADMIN } from '@/test/fake-api';
import {
  ORDER_ID,
  ORDER_NUMBER,
  adminOrder,
  adminOrderSummary,
  adminOrdersPage,
} from '@/test/fixtures';
import { renderApp } from '@/test/render-app';

vi.mock('@/features/admin/orders/api');
vi.mock('@/features/admin/products/api');
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const fetchList = vi.mocked(ordersApi.fetchAdminOrders);
const fetchOne = vi.mocked(ordersApi.fetchAdminOrder);
const changeStatus = vi.mocked(ordersApi.changeOrderStatus);
const lastQuery = () => fetchList.mock.lastCall?.[0];

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, message: `${code} message`, requestId: 'req-4' });

beforeEach(() => {
  vi.resetAllMocks();
  fetchList.mockResolvedValue(adminOrdersPage([adminOrderSummary()]));
});

describe('the admin order table', () => {
  it('lists orders with number, date, customer, status and total', async () => {
    renderApp('/admin/orders', ADMIN);

    const link = await screen.findByRole('link', { name: ORDER_NUMBER });
    const row = link.closest('tr')!;

    expect(link).toHaveAttribute('href', `/admin/orders/${ORDER_ID}`);
    expect(within(row).getByText('Ann Lee')).toBeInTheDocument();
    expect(within(row).getByText('ann@example.com')).toBeInTheDocument();
    expect(within(row).getByText('Processing')).toBeInTheDocument();
    expect(within(row).getByText('$129.48')).toBeInTheDocument();
    expect(within(row).getByText(/Oct \d{1,2}, 2026/)).toBeInTheDocument();
  });

  it('reads every filter from the URL', async () => {
    renderApp('/admin/orders?status=SHIPPED&from=2026-10-01&to=2026-10-07&email=ann&page=2', ADMIN);

    await screen.findByRole('link', { name: ORDER_NUMBER });

    expect(lastQuery()).toEqual({
      status: 'SHIPPED',
      from: '2026-10-01',
      to: '2026-10-07',
      customerEmail: 'ann',
      page: 2,
    });
    expect(screen.getByLabelText('Customer email')).toHaveValue('ann');
    expect(screen.getByLabelText('Status')).toHaveValue('SHIPPED');
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-07');
  });

  it('filters by status at once, starting over from page 1', async () => {
    const { router } = renderApp('/admin/orders?page=3', ADMIN);
    await screen.findByRole('link', { name: ORDER_NUMBER });

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Cancelled');

    await waitFor(() => expect(lastQuery()).toMatchObject({ status: 'CANCELLED', page: 1 }));
    expect(router.state.location.search).toBe('?status=CANCELLED');
  });

  it('filters by customer email after typing pauses', async () => {
    const { router } = renderApp('/admin/orders', ADMIN);
    await screen.findByRole('link', { name: ORDER_NUMBER });

    await userEvent.type(screen.getByLabelText('Customer email'), 'ann@');

    await waitFor(() => expect(router.state.location.search).toBe('?email=ann%40'));
    expect(lastQuery()).toMatchObject({ customerEmail: 'ann@' });
  });

  it('filters by date range', async () => {
    const { router } = renderApp('/admin/orders', ADMIN);
    await screen.findByRole('link', { name: ORDER_NUMBER });

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-05' } });

    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ from: '2026-10-01', to: '2026-10-05' }),
    );
    expect(router.state.location.search).toBe('?from=2026-10-01&to=2026-10-05');
  });

  it('shows an inverted range as an error and does not ask the server for it', async () => {
    const { router } = renderApp('/admin/orders?from=2026-10-01&to=2026-10-07', ADMIN);
    await screen.findByRole('link', { name: ORDER_NUMBER });
    const calls = fetchList.mock.calls.length;

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } });

    expect(await screen.findByText('Must not be before the start date')).toBeInTheDocument();
    expect(fetchList.mock.calls.length).toBe(calls);
    expect(router.state.location.search).toBe('?from=2026-10-01&to=2026-10-07');
  });

  it('pages, and the back button returns to the previous page', async () => {
    fetchList.mockResolvedValue(
      adminOrdersPage([adminOrderSummary()], { total: 45, totalPages: 3 }),
    );
    const { router } = renderApp('/admin/orders', ADMIN);
    await screen.findByRole('link', { name: ORDER_NUMBER });

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));

    await act(() => router.navigate(-1));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1 }));
  });

  it('distinguishes "no orders yet" from "none match the filters"', async () => {
    fetchList.mockResolvedValue(adminOrdersPage([]));
    const { router } = renderApp('/admin/orders?status=NEW', ADMIN);

    expect(await screen.findByText('No orders found')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Reset filters' })[1]);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
  });

  it('shows the error with a retry', async () => {
    fetchList.mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR'));
    renderApp('/admin/orders', ADMIN);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: ORDER_NUMBER })).toBeInTheDocument();
  });
});

describe('an admin order page', () => {
  it('shows the order with its customer and address', async () => {
    fetchOne.mockResolvedValue(adminOrder());
    renderApp(`/admin/orders/${ORDER_ID}`, ADMIN);

    expect(
      await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ann Lee')).toBeInTheDocument();
    expect(screen.getByText('ann@example.com')).toBeInTheDocument();
    expect(screen.getByText(/12 Main Street/)).toBeInTheDocument();
    expect(screen.getByText('$129.48')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(fetchOne).toHaveBeenCalledWith(ORDER_ID, expect.anything());
  });

  it('offers exactly the steps in allowedTransitions', async () => {
    fetchOne.mockResolvedValue(adminOrder({ allowedTransitions: ['SHIPPED', 'CANCELLED'] }));
    renderApp(`/admin/orders/${ORDER_ID}`, ADMIN);

    expect(await screen.findByRole('button', { name: 'Mark as shipped' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as completed' })).not.toBeInTheDocument();
  });

  it('offers only completing a shipped order', async () => {
    fetchOne.mockResolvedValue(
      adminOrder({ status: 'SHIPPED', allowedTransitions: ['COMPLETED'] }),
    );
    renderApp(`/admin/orders/${ORDER_ID}`, ADMIN);

    expect(await screen.findByRole('button', { name: 'Mark as completed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as shipped' })).not.toBeInTheDocument();
  });

  it('offers nothing for a finished order, and says who cancelled it', async () => {
    fetchOne.mockResolvedValue(
      adminOrder({
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        cancelReason: 'CUSTOMER_REQUEST',
        allowedTransitions: [],
      }),
    );
    renderApp(`/admin/orders/${ORDER_ID}`, ADMIN);

    expect(await screen.findByText('Cancelled by the customer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark as|Cancel order/ })).not.toBeInTheDocument();
  });

  it('ships an order at once and shows the new status', async () => {
    fetchOne.mockResolvedValue(adminOrder());
    changeStatus.mockResolvedValue(
      adminOrder({ status: 'SHIPPED', allowedTransitions: ['COMPLETED'] }),
    );
    renderApp(`/admin/orders/${ORDER_ID}`, ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Mark as shipped' }));

    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith(ORDER_ID, 'SHIPPED'));
    expect(await screen.findByRole('button', { name: 'Mark as completed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as shipped' })).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Order updated');
  });

  it('cancels only after confirmation, and reloads the product tables (stock is back)', async () => {
    fetchOne.mockResolvedValue(adminOrder());
    changeStatus.mockResolvedValue(
      adminOrder({
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        cancelReason: 'ADMIN_ACTION',
        allowedTransitions: [],
      }),
    );
    const { queryClient } = renderApp(`/admin/orders/${ORDER_ID}`, ADMIN);
    queryClient.setQueryData(['admin', 'products', 'list', 'any'], { items: [] });

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    expect(changeStatus).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/payment is refunded/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }));

    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith(ORDER_ID, 'CANCELLED'));
    expect(await screen.findByText('Cancelled by the shop')).toBeInTheDocument();
    expect(queryClient.getQueryState(['admin', 'products', 'list', 'any'])?.isInvalidated).toBe(
      true,
    );
    expect(productsApi.fetchAdminProducts).not.toHaveBeenCalled();
  });

  it('says the order moved on when the customer got there first, and shows where it is now', async () => {
    fetchOne
      .mockResolvedValueOnce(
        adminOrder({ status: 'NEW', paymentStatus: 'PENDING', allowedTransitions: ['CANCELLED'] }),
      )
      .mockResolvedValue(
        adminOrder({
          status: 'CANCELLED',
          paymentStatus: 'VOIDED',
          cancelReason: 'CUSTOMER_REQUEST',
          allowedTransitions: [],
        }),
      );
    changeStatus.mockRejectedValue(apiError(409, 'INVALID_ORDER_TRANSITION'));
    renderApp(`/admin/orders/${ORDER_ID}`, ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel order' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The order changed in the meantime and cannot take that step. It has been refreshed.',
      ),
    );
    expect(await screen.findByText('Cancelled by the customer')).toBeInTheDocument();
  });

  it('says there is no such order', async () => {
    fetchOne.mockRejectedValue(apiError(404, 'ORDER_NOT_FOUND'));
    renderApp(`/admin/orders/${ORDER_ID}`, ADMIN);

    expect(await screen.findByText('Order not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All orders' })).toHaveAttribute(
      'href',
      '/admin/orders',
    );
  });
});
