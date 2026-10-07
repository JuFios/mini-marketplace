import { useState } from 'react';
import { Link } from 'react-router';
import type { Order } from '@/shared/api/types';
import { formatDateTime } from '@/shared/lib/date';
import { Button, Modal, Price } from '@/shared/ui';
import { orderNumber, PAYMENT_LABELS } from '../status';
import { OrderStatusBadge } from './order-status-badge';
import { PaymentResult } from './payment-result';

export interface OrderDetailsProps {
  order: Order;
  pollingTimedOut: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onCancel: () => void;
  isCancelling: boolean;
}

export function OrderDetails({
  order,
  pollingTimedOut,
  onRefresh,
  isRefreshing,
  onCancel,
  isCancelling,
}: OrderDetailsProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // The server decides what is possible right now (it also changes under us: the worker may have
  // finished the payment); the button follows `allowedTransitions` and nothing else.
  const canCancel = order.allowedTransitions.includes('CANCELLED');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to="/orders" className="text-sm font-medium text-brand-600 hover:underline">
          ← My orders
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Order {orderNumber(order.id)}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-slate-600">Placed {formatDateTime(order.createdAt)}</p>
      </div>

      <PaymentResult
        order={order}
        pollingTimedOut={pollingTimedOut}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />

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
              <dt className="text-slate-600">Shipping address</dt>
              <dd className="whitespace-pre-line text-slate-900">{order.shippingAddress}</dd>
            </div>
          </dl>
          {canCancel && (
            <Button
              variant="secondary"
              className="w-full"
              isLoading={isCancelling}
              onClick={() => setConfirmingCancel(true)}
            >
              Cancel order
            </Button>
          )}
        </aside>
      </div>

      <Modal
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        title="Cancel this order?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingCancel(false)}>
              Keep order
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingCancel(false);
                onCancel();
              }}
            >
              Cancel order
            </Button>
          </>
        }
      >
        {order.paymentStatus === 'PAID'
          ? 'The items go back into stock and your payment is refunded.'
          : 'The items go back into stock. You will not be charged.'}
      </Modal>
    </div>
  );
}
