import { Link } from 'react-router';
import type { OrderSummary } from '@/shared/api/types';
import { formatDateTime } from '@/shared/lib/date';
import { Price } from '@/shared/ui';
import { orderNumber } from '../status';
import { OrderStatusBadge } from './order-status-badge';

export function OrderListItem({ order }: { order: OrderSummary }) {
  return (
    <li>
      <Link
        to={`/orders/${order.id}`}
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <div className="space-y-1">
          <p className="font-medium text-slate-900">Order {orderNumber(order.id)}</p>
          <p className="text-sm text-slate-600">
            {formatDateTime(order.createdAt)} · {order.itemsCount}{' '}
            {order.itemsCount === 1 ? 'product' : 'products'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <OrderStatusBadge status={order.status} />
          <Price value={order.totalAmount} className="font-semibold text-slate-900" />
        </div>
      </Link>
    </li>
  );
}
