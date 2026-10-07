import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getErrorMessage } from '@/shared/api/error-messages';
import { saveBlob } from '@/shared/lib/save-blob';
import { adminKeys } from '../keys';
import { fetchSalesByDay, fetchSalesReport, fetchSalesSummary } from './api';
import type { DateRange } from './date-range';

export function useSalesSummaryQuery(range: DateRange) {
  return useQuery({
    queryKey: adminKeys.summary(range),
    queryFn: ({ signal }) => fetchSalesSummary(range, signal),
    // Keep the old numbers (dimmed) while a new range loads instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });
}

export function useSalesByDayQuery(range: DateRange) {
  return useQuery({
    queryKey: adminKeys.salesByDay(range),
    queryFn: ({ signal }) => fetchSalesByDay(range, signal),
    placeholderData: keepPreviousData,
  });
}

/** Fetches the CSV for `range` and hands it to the browser as a download. */
export function useDownloadSalesReport() {
  return useMutation({
    mutationFn: async (range: DateRange) => {
      const { blob, filename } = await fetchSalesReport(range);
      saveBlob(blob, filename);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
