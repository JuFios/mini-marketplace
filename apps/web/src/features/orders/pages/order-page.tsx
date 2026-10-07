import { Link, useParams } from 'react-router';
import { ApiError } from '@/shared/api/errors';
import { EmptyState, QueryBoundary, Spinner, buttonStyles } from '@/shared/ui';
import { OrderDetails } from '../components/order-details';
import { useCancelOrder, useOrderQuery } from '../queries';

function OrderContent({ id }: { id: string }) {
  const { query, pollingTimedOut } = useOrderQuery(id);
  const cancel = useCancelOrder();

  // The API says 404 for an unknown or someone else's order and 400 for a malformed id; to the
  // customer both are simply "no such order".
  if (query.error instanceof ApiError && [400, 404].includes(query.error.status)) {
    return (
      <EmptyState
        title="Order not found"
        description="It may belong to another account or the link is wrong."
        action={
          <Link to="/orders" className={buttonStyles('primary')}>
            My orders
          </Link>
        }
      />
    );
  }

  return (
    <QueryBoundary
      query={query}
      loading={<Spinner size="lg" className="mx-auto my-16 text-brand-600" />}
    >
      {(order) => (
        <OrderDetails
          order={order}
          pollingTimedOut={pollingTimedOut}
          onRefresh={() => void query.refetch()}
          isRefreshing={query.isFetching}
          onCancel={() => cancel.mutate(order.id)}
          isCancelling={cancel.isPending}
        />
      )}
    </QueryBoundary>
  );
}

export function OrderPage() {
  const { id = '' } = useParams();
  // Keyed, so that opening another order starts its polling window afresh.
  return <OrderContent key={id} id={id} />;
}
