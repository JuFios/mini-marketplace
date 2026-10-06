import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { OrderWithItems } from './mappers/to-order-response';

// Lines in a stable, readable order: by name, then id for products that share one.
const WITH_ITEMS = {
  items: { orderBy: [{ productName: 'asc' }, { productId: 'asc' }] },
} as const satisfies Prisma.OrderInclude;

export interface NewOrderItem {
  productId: string;
  productName: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
}

export interface NewOrder {
  userId: string;
  idempotencyKey: string;
  shippingAddress: string;
  totalAmount: Prisma.Decimal;
  items: NewOrderItem[];
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** An order of this customer; another customer's order is simply not found. */
  findOwn(userId: string, id: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findFirst({ where: { id, userId }, include: WITH_ITEMS });
  }

  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderWithItems | null> {
    return (tx ?? this.prisma).order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: WITH_ITEMS,
    });
  }

  /**
   * Inserts the order and its lines. The unique index on (user_id, idempotency_key) rejects a
   * second order for the same key, whatever the interleaving of the requests that carry it.
   */
  create(order: NewOrder, tx: Prisma.TransactionClient): Promise<OrderWithItems> {
    return tx.order.create({
      data: {
        userId: order.userId,
        idempotencyKey: order.idempotencyKey,
        shippingAddress: order.shippingAddress,
        totalAmount: order.totalAmount,
        status: OrderStatus.NEW,
        paymentStatus: PaymentStatus.PENDING,
        items: { createMany: { data: order.items } },
      },
      include: WITH_ITEMS,
    });
  }
}
