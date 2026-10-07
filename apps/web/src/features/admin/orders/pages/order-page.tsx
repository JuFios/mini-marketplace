import { Link, useParams } from 'react-router';
import { ApiError } from '@/shared/api/errors';
import { EmptyState, QueryBoundary, Spinner, buttonStyles } from '@/shared/ui';
import { AdminOrderDetails } from '../components/admin-order-details';
import { useAdminOrderQuery, useChangeOrderStatus } from '../queries';

function OrderContent({ id }: { id: string }) {
  const order = useAdminOrderQuery(id);
  const change = useChangeOrderStatus(id);

  // 404 for an unknown order, 400 for a malformed id: to an administrator both are "no such order".
  if (order.error instanceof ApiError && [400, 404].includes(order.error.status)) {
    return (
      <EmptyState
        title="Order not found"
        description="The link may be wrong."
        action={
          <Link to="/admin/orders" className={buttonStyles('primary')}>
            All orders
          </Link>
        }
      />
    );
  }

  return (
    <QueryBoundary
      query={order}
      loading={<Spinner size="lg" className="mx-auto my-16 text-brand-600" />}
    >
      {(data) => (
        <AdminOrderDetails
          order={data}
          onChangeStatus={(status) => change.mutate(status)}
          isChanging={change.isPending}
        />
      )}
    </QueryBoundary>
  );
}

export function AdminOrderPage() {
  const { id = '' } = useParams();
  return <OrderContent key={id} id={id} />;
}
