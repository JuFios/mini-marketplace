import type { CancelReason, OrderStatus, PaymentStatus } from '@/shared/api/types';

// Typed over every status: adding one to the API types does not compile until it is worded here.
export const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'New',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Declined',
  REFUNDED: 'Refunded',
  VOIDED: 'Not charged',
};

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  CUSTOMER_REQUEST: 'Cancelled by the customer',
  ADMIN_ACTION: 'Cancelled by the shop',
  PAYMENT_FAILED: 'Payment was declined',
};

/** A short, readable handle for an order: the first block of its id. */
export function orderNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
