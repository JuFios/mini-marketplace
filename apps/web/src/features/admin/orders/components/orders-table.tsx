import { Link } from 'react-router';
import { OrderStatusBadge } from '@/features/orders/components/order-status-badge';
import { orderNumber } from '@/features/orders/status';
import type { AdminOrderSummary } from '@/shared/api/types';
import { formatDateTime } from '@/shared/lib/date';
import { Price, Table, Td, Th } from '@/shared/ui';

export function OrdersTable({ orders }: { orders: AdminOrderSummary[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Order</Th>
          <Th>Placed</Th>
          <Th>Customer</Th>
          <Th>Status</Th>
          <Th className="text-right">Total</Th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <Td>
              <Link
                to={`/admin/orders/${order.id}`}
                className="font-medium text-brand-600 hover:underline"
              >
                {orderNumber(order.id)}
              </Link>
            </Td>
            <Td className="whitespace-nowrap text-slate-600">{formatDateTime(order.createdAt)}</Td>
            <Td>
              <p className="max-w-xs truncate font-medium text-slate-900">{order.customer.name}</p>
              <p className="max-w-xs truncate text-xs text-slate-500">{order.customer.email}</p>
            </Td>
            <Td>
              <OrderStatusBadge status={order.status} />
            </Td>
            <Td className="text-right font-semibold">
              <Price value={order.totalAmount} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
