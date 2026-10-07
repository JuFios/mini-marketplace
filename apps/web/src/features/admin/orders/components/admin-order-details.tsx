import { useState } from 'react';
import { Link } from 'react-router';
import { OrderStatusBadge } from '@/features/orders/components/order-status-badge';
import { CANCEL_REASON_LABELS, orderNumber, PAYMENT_LABELS } from '@/features/orders/status';
import type { AdminOrder, OrderStatus } from '@/shared/api/types';
import { formatDateTime } from '@/shared/lib/date';
import { Button, ConfirmDialog, Price } from '@/shared/ui';

/** What each step the API can offer is called on a button. `NEW` and `PROCESSING` are never offered. */
const ACTIONS: Partial<Record<OrderStatus, string>> = {
  SHIPPED: 'Mark as shipped',
  COMPLETED: 'Mark as completed',
  CANCELLED: 'Cancel order',
};

export interface AdminOrderDetailsProps {
  order: AdminOrder;
  onChangeStatus: (status: OrderStatus) => void;
  isChanging: boolean;
}

export function AdminOrderDetails({ order, onChangeStatus, isChanging }: AdminOrderDetailsProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // The server decides what is possible right now (the customer or the worker may have moved the
  // order); the buttons follow `allowedTransitions` and nothing else.
  const actions = order.allowedTransitions.filter((status) => ACTIONS[status] !== undefined);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to="/admin/orders" className="text-sm font-medium text-brand-600 hover:underline">
          ← All orders
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Order {orderNumber(order.id)}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-slate-600">Placed {formatDateTime(order.createdAt)}</p>
        {order.cancelReason && (
          <p className="text-sm font-medium text-slate-700">
            {CANCEL_REASON_LABELS[order.cancelReason]}
          </p>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="order-items" className="space-y-3">
          <h2 id="order-items" className="text-lg font-semibold text-slate-900">
            Items
          </h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-4">
            {order.items.map((item) => (
              <li key={item.productId} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{item.productName}</p>
                  <p className="text-sm text-slate-600">
                    {item.quantity} × <Price value={item.unitPrice} />
                  </p>
                </div>
                <Price value={item.lineTotal} className="font-semibold text-slate-900" />
              </li>
            ))}
          </ul>
        </section>

        <aside className="h-fit space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd>
                <Price value={order.totalAmount} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Payment</dt>
              <dd>{PAYMENT_LABELS[order.paymentStatus]}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-slate-600">Customer</dt>
              <dd className="text-slate-900">
                {order.customer.name}
                <br />
                <span className="break-all text-slate-600">{order.customer.email}</span>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-slate-600">Shipping address</dt>
              <dd className="whitespace-pre-line text-slate-900">{order.shippingAddress}</dd>
            </div>
          </dl>
          {actions.length > 0 && (
            <div className="flex flex-col gap-2">
              {actions.map((status) => (
                <Button
                  key={status}
                  variant={status === 'CANCELLED' ? 'secondary' : 'primary'}
                  disabled={isChanging}
                  onClick={() =>
                    status === 'CANCELLED' ? setConfirmingCancel(true) : onChangeStatus(status)
                  }
                >
                  {ACTIONS[status]}
                </Button>
              ))}
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        onConfirm={() => onChangeStatus('CANCELLED')}
        title="Cancel this order?"
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
      >
        {order.paymentStatus === 'PAID'
          ? 'The items go back into stock and the payment is refunded.'
          : 'The items go back into stock. The customer will not be charged.'}
      </ConfirmDialog>
    </div>
  );
}
