import type { Prisma } from '../../../generated/prisma/client';
import type {
  AdminOrderResponse,
  AdminOrderSummaryResponse,
  OrderCustomerResponse,
  OrderResponse,
  OrderSummaryResponse,
} from '../dto/order.response.dto';
import { allowedTransitions, OrderActor } from '../order-state-machine';

/** The part of a customer an administrator sees next to an order. */
export const CUSTOMER_SELECT = {
  select: { id: true, email: true, name: true },
} as const satisfies Prisma.UserDefaultArgs;

/** What a list needs from an order: no lines, only how many there are. */
export const ITEMS_COUNT = {
  _count: { select: { items: true } },
} as const satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;
export type OrderWithCustomer = Prisma.OrderGetPayload<{
  include: { items: true; user: typeof CUSTOMER_SELECT };
}>;
export type OrderSummaryRow = Prisma.OrderGetPayload<{ include: typeof ITEMS_COUNT }>;
export type AdminOrderSummaryRow = Prisma.OrderGetPayload<{
  include: typeof ITEMS_COUNT & { user: typeof CUSTOMER_SELECT };
}>;

/**
 * Explicit allow-list of fields: the entity also carries the owner's id, the idempotency key and
 * the payment reference, none of which the customer needs to see. `actor` decides which
 * transitions are offered, so the same order is rendered for the customer or the administrator.
 */
export function toOrderResponse(order: OrderWithItems, actor: OrderActor): OrderResponse {
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    cancelReason: order.cancelReason,
    totalAmount: order.totalAmount.toFixed(2),
    shippingAddress: order.shippingAddress,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: item.unitPrice.mul(item.quantity).toFixed(2),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    allowedTransitions: allowedTransitions(order, actor),
  };
}

function toCustomerResponse(user: OrderCustomerResponse): OrderCustomerResponse {
  return { id: user.id, email: user.email, name: user.name };
}

export function toAdminOrderResponse(order: OrderWithCustomer): AdminOrderResponse {
  return { ...toOrderResponse(order, 'admin'), customer: toCustomerResponse(order.user) };
}

export function toOrderSummary(order: OrderSummaryRow): OrderSummaryResponse {
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalAmount: order.totalAmount.toFixed(2),
    itemsCount: order._count.items,
    createdAt: order.createdAt.toISOString(),
  };
}

export function toAdminOrderSummary(order: AdminOrderSummaryRow): AdminOrderSummaryResponse {
  return { ...toOrderSummary(order), customer: toCustomerResponse(order.user) };
}
