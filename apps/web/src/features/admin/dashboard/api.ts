import { http } from '@/shared/api/client';
import type { SalesByDay, SalesSummary } from '@/shared/api/types';
import type { DateRange } from './date-range';

export async function fetchSalesSummary(
  range: DateRange,
  signal?: AbortSignal,
): Promise<SalesSummary> {
  const { data } = await http.get<SalesSummary>('/admin/analytics/summary', {
    params: range,
    signal,
  });
  return data;
}

export async function fetchSalesByDay(range: DateRange, signal?: AbortSignal): Promise<SalesByDay> {
  const { data } = await http.get<SalesByDay>('/admin/analytics/sales-by-day', {
    params: range,
    signal,
  });
  return data;
}

/** The report as a file: it needs the bearer header, so it is fetched as a Blob, not opened as a link. */
export async function fetchSalesReport(
  range: DateRange,
): Promise<{ blob: Blob; filename: string }> {
  const { data } = await http.get<Blob>('/admin/analytics/sales-report.csv', {
    params: range,
    responseType: 'blob',
  });
  // Built from the range, the same way the API names the file in its Content-Disposition.
  return { blob: data, filename: `sales-${range.from}-${range.to}.csv` };
}
