import type { Prisma } from '../../../generated/prisma/client';
import type { OrderResponse } from '../dto/order.response.dto';

export type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

/**
 * Explicit allow-list of fields: the entity also carries the owner's id, the idempotency key and
 * the payment reference, none of which the customer needs to see.
 */
export function toOrderResponse(order: OrderWithItems): OrderResponse {
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
  };
}
