import { Link } from 'react-router';
import { ORDER_STATUSES } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import {
  Button,
  EmptyState,
  FormField,
  Pagination,
  QueryBoundary,
  Select,
  buttonStyles,
} from '@/shared/ui';
import { OrderListItem } from '../components/order-list-item';
import { isOrderStatus } from '../filters';
import { useOrdersQuery } from '../queries';
import { STATUS_LABELS } from '../status';
import { useOrderFilters } from '../use-order-filters';

export function OrdersPage() {
  const { filters, update } = useOrderFilters();
  const orders = useOrdersQuery(filters);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">My orders</h1>
      <FormField label="Status" className="max-w-xs">
        {(control) => (
          <Select
            {...control}
            value={filters.status}
            onChange={(event) =>
              update({ status: isOrderStatus(event.target.value) ? event.target.value : '' })
            }
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <QueryBoundary
        query={orders}
        isEmpty={(data) => data.items.length === 0}
        empty={
          filters.status ? (
            <EmptyState
              title="No orders with this status"
              action={
                <Button variant="secondary" onClick={() => update({ status: '' })}>
                  Show all orders
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="You have not placed any orders yet"
              description="Once you check out, your orders will appear here."
              action={
                <Link to="/" className={buttonStyles('primary')}>
                  Browse products
                </Link>
              }
            />
          )
        }
      >
        {(data) => (
          // While the next page loads, the previous one stays, dimmed.
          <div className={cn('space-y-6', orders.isPlaceholderData && 'opacity-60')}>
            <p className="text-sm text-slate-600" aria-live="polite">
              {data.meta.total} {data.meta.total === 1 ? 'order' : 'orders'}
            </p>
            <ul className="space-y-3">
              {data.items.map((order) => (
                <OrderListItem key={order.id} order={order} />
              ))}
            </ul>
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
