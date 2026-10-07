import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as analyticsApi from '@/features/admin/dashboard/api';
import { lastDays } from '@/features/admin/dashboard/date-range';
import { ApiError } from '@/shared/api/errors';
import { saveBlob } from '@/shared/lib/save-blob';
import { ADMIN, deferred } from '@/test/fake-api';
import { SALES_BY_DAY, SALES_SUMMARY } from '@/test/fixtures';
import { renderApp } from '@/test/render-app';

vi.mock('@/features/admin/dashboard/api');
vi.mock('@/shared/lib/save-blob', () => ({ saveBlob: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
// Recharts measures its container, which jsdom cannot; the chart's own job is drawing.
vi.mock('@/features/admin/dashboard/components/sales-chart', () => ({
  SalesChart: ({ days }: { days: unknown[] }) => (
    <div data-testid="sales-chart">{days.length} days</div>
  ),
}));

const fetchSummary = vi.mocked(analyticsApi.fetchSalesSummary);
const fetchByDay = vi.mocked(analyticsApi.fetchSalesByDay);
const fetchReport = vi.mocked(analyticsApi.fetchSalesReport);
const lastRange = () => fetchSummary.mock.lastCall?.[0];

beforeEach(() => {
  vi.resetAllMocks();
  fetchSummary.mockResolvedValue(SALES_SUMMARY);
  fetchByDay.mockResolvedValue(SALES_BY_DAY);
});

describe('the dashboard', () => {
  it('shows the key figures, the top products and the daily chart', async () => {
    renderApp('/admin', ADMIN);

    expect(await screen.findByText('$149.47')).toBeInTheDocument();
    expect(screen.getByText('$74.74')).toBeInTheDocument();
    expect(screen.getByText('Orders', { selector: 'p' }).nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
    expect(screen.getByText('$89.50')).toBeInTheDocument();
    expect(screen.getByText('$59.97')).toBeInTheDocument();
    expect(await screen.findByTestId('sales-chart')).toHaveTextContent('2 days');
  });

  it('starts with the last 30 days (UTC), and shows them in the pickers', async () => {
    renderApp('/admin', ADMIN);
    await screen.findByText('$149.47');

    const expected = lastDays(30, new Date());
    expect(lastRange()).toEqual(expected);
    expect(fetchByDay.mock.lastCall?.[0]).toEqual(expected);
    expect(screen.getByLabelText('From')).toHaveValue(expected.from);
    expect(screen.getByLabelText('To')).toHaveValue(expected.to);
  });

  it('asks again for the range the person picks', async () => {
    renderApp('/admin', ADMIN);
    await screen.findByText('$149.47');

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });

    await waitFor(() => expect(lastRange()).toMatchObject({ from: '2026-10-01' }));
    expect(fetchByDay.mock.lastCall?.[0]).toMatchObject({ from: '2026-10-01' });
  });

  it('has quick ranges', async () => {
    renderApp('/admin', ADMIN);
    await screen.findByText('$149.47');

    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));

    await waitFor(() => expect(lastRange()).toEqual(lastDays(7, new Date())));
    expect(screen.getByLabelText('From')).toHaveValue(lastDays(7, new Date()).from);
  });

  it('explains an inverted range and keeps showing the last valid one', async () => {
    renderApp('/admin', ADMIN);
    await screen.findByText('$149.47');
    const calls = fetchSummary.mock.calls.length;

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2000-01-01' } });

    expect(
      await screen.findByText('The start date must not be after the end date'),
    ).toBeInTheDocument();
    expect(fetchSummary.mock.calls.length).toBe(calls);
    expect(screen.getByText('$149.47')).toBeInTheDocument();
  });

  it('refuses a range over 366 days without asking the server', async () => {
    renderApp('/admin', ADMIN);
    await screen.findByText('$149.47');
    const calls = fetchSummary.mock.calls.length;

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2020-01-01' } });

    expect(await screen.findByText('The range cannot be longer than 366 days')).toBeInTheDocument();
    expect(fetchSummary.mock.calls.length).toBe(calls);
  });

  it('says so when the period had no sales', async () => {
    fetchSummary.mockResolvedValue({
      ...SALES_SUMMARY,
      totalRevenue: '0.00',
      ordersCount: 0,
      averageOrderValue: '0.00',
      topProducts: [],
    });
    renderApp('/admin', ADMIN);

    expect(await screen.findByText('No sales in this period')).toBeInTheDocument();
  });

  it('shows the error with a retry', async () => {
    fetchSummary.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'boom', requestId: 'req-8' }),
    );
    renderApp('/admin', ADMIN);

    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Something went wrong');
    await userEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);

    expect(await screen.findByText('$149.47')).toBeInTheDocument();
  });
});

describe('downloading the CSV report', () => {
  it('fetches the report for the chosen range and saves it as a file', async () => {
    const blob = new Blob(['order_id\r\n'], { type: 'text/csv' });
    fetchReport.mockResolvedValue({ blob, filename: 'sales-2026-10-01-2026-10-07.csv' });
    renderApp('/admin', ADMIN);
    await screen.findByText('$149.47');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-07' } });
    await waitFor(() => expect(lastRange()).toEqual({ from: '2026-10-01', to: '2026-10-07' }));

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() =>
      expect(fetchReport).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-07' }),
    );
    await waitFor(() =>
      expect(saveBlob).toHaveBeenCalledWith(blob, 'sales-2026-10-01-2026-10-07.csv'),
    );
  });

  it('is busy while the file is on its way, so it is not requested twice', async () => {
    const reply = deferred<{ blob: Blob; filename: string }>();
    fetchReport.mockReturnValue(reply.promise);
    renderApp('/admin', ADMIN);
    await screen.findByText('$149.47');

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(fetchReport).toHaveBeenCalledTimes(1);
    const blob = new Blob(['x']);
    reply.resolve({ blob, filename: 'sales.csv' });
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'sales.csv'));
  });

  it('saves nothing and says why when the download fails', async () => {
    fetchReport.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
    );
    renderApp('/admin', ADMIN);
    await screen.findByText('$149.47');

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Cannot reach the server. Check your connection and try again.',
      ),
    );
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
