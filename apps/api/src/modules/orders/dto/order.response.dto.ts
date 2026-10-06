import { CancelReason, OrderStatus, PaymentStatus } from '../../../generated/prisma/client';

export class OrderItemResponse {
  productId!: string;
  /** The product's name when the order was placed; later edits do not change it. */
  productName!: string;
  /** The price paid per unit, a decimal string. */
  unitPrice!: string;
  quantity!: number;
  /** `unitPrice × quantity`, a decimal string. */
  lineTotal!: string;
}

export class OrderResponse {
  id!: string;
  status!: OrderStatus;
  paymentStatus!: PaymentStatus;
  cancelReason!: CancelReason | null;
  /** Sum of all line totals, a decimal string. */
  totalAmount!: string;
  shippingAddress!: string;
  items!: OrderItemResponse[];
  createdAt!: string;
  updatedAt!: string;
}
