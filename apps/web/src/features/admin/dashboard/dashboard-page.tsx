import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button, EmptyState, Price, QueryBoundary } from '@/shared/ui';
import { DateRangePicker } from './components/date-range-picker';
import { KpiCard } from './components/kpi-card';
import { SalesChart } from './components/sales-chart';
import { TopProductsTable } from './components/top-products-table';
import { DEFAULT_RANGE_DAYS, getRangeError, lastDays, type DateRange } from './date-range';
import { useDownloadSalesReport, useSalesByDayQuery, useSalesSummaryQuery } from './queries';

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const;

export function DashboardPage() {
  // The inputs may hold a half-typed or invalid range; only a valid one is ever asked of the API.
  const [draft, setDraft] = useState<DateRange>(() => lastDays(DEFAULT_RANGE_DAYS, new Date()));
  const [range, setRange] = useState<DateRange>(draft);
  const summary = useSalesSummaryQuery(range);
  const salesByDay = useSalesByDayQuery(range);
  const download = useDownloadSalesReport();

  function change(next: DateRange) {
    setDraft(next);
    if (getRangeError(next) === null) setRange(next);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <Button isLoading={download.isPending} onClick={() => download.mutate(range)}>
          Download CSV
        </Button>
      </div>
      <DateRangePicker
        value={draft}
        onChange={change}
        presets={PRESETS}
        onPreset={(days) => change(lastDays(days, new Date()))}
      />

      <QueryBoundary query={summary}>
        {(data) => (
          <div className={cn('space-y-8', summary.isPlaceholderData && 'opacity-60')}>
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard label="Revenue">
                <Price value={data.totalRevenue} />
              </KpiCard>
              <KpiCard label="Orders">{data.ordersCount}</KpiCard>
              <KpiCard label="Average order value">
                <Price value={data.averageOrderValue} />
              </KpiCard>
            </div>
            <section aria-labelledby="top-products" className="space-y-3">
              <h2 id="top-products" className="text-lg font-semibold text-slate-900">
                Top products
              </h2>
              {data.topProducts.length === 0 ? (
                <EmptyState title="No sales in this period" />
              ) : (
                <TopProductsTable products={data.topProducts} />
              )}
            </section>
          </div>
        )}
      </QueryBoundary>

      <section aria-labelledby="sales-by-day" className="space-y-3">
        <h2 id="sales-by-day" className="text-lg font-semibold text-slate-900">
          Revenue by day
        </h2>
        <QueryBoundary query={salesByDay}>
          {(data) => (
            <div className={cn(salesByDay.isPlaceholderData && 'opacity-60')}>
              <SalesChart days={data.days} />
            </div>
          )}
        </QueryBoundary>
      </section>
    </div>
  );
}
