import { useExternalNavigationKey } from '@/shared/hooks/use-external-navigation-key';
import { cn } from '@/shared/lib/cn';
import { Button, EmptyState, Pagination, QueryBoundary } from '@/shared/ui';
import { OrdersFilters } from '../components/orders-filters';
import { OrdersTable } from '../components/orders-table';
import { hasActiveFilters } from '../filters';
import { useAdminOrdersQuery } from '../queries';
import { useAdminOrderFilters } from '../use-order-filters';

export function AdminOrdersPage() {
  const { filters, update, reset } = useAdminOrderFilters();
  const orders = useAdminOrdersQuery(filters);
  const filtersKey = useExternalNavigationKey();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
      <OrdersFilters
        key={filtersKey}
        filters={filters}
        onChange={update}
        onReset={reset}
        isFiltered={hasActiveFilters(filters)}
      />
      <QueryBoundary
        query={orders}
        isEmpty={(data) => data.items.length === 0}
        empty={
          hasActiveFilters(filters) ? (
            <EmptyState
              title="No orders found"
              description="Try fewer filters or a wider date range."
              action={
                <Button variant="secondary" onClick={reset}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No orders yet"
              description="Orders placed in the shop appear here."
            />
          )
        }
      >
        {(data) => (
          <div className={cn('space-y-4', orders.isPlaceholderData && 'opacity-60')}>
            <p className="text-sm text-slate-600" aria-live="polite">
              {data.meta.total} {data.meta.total === 1 ? 'order' : 'orders'}
            </p>
            <OrdersTable orders={data.items} />
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onPageChange={(page) => {
                update({ page }, { push: true });
                window.scrollTo({ top: 0 });
              }}
              className="justify-center"
            />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
