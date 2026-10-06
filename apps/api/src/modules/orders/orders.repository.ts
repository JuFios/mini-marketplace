import { Injectable } from '@nestjs/common';
import { escapeLike } from '../../common/prisma/escape-like';
import { CancelReason, OrderStatus, PaymentStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { CreatedAtRange } from './created-at-range';
import {
  AdminOrderSummaryRow,
  CUSTOMER_SELECT,
  ITEMS_COUNT,
  OrderSummaryRow,
  OrderWithCustomer,
  OrderWithItems,
} from './mappers/to-order-response';

// Lines in a stable, readable order: by name, then id for products that share one.
const WITH_ITEMS = {
  items: { orderBy: [{ productName: 'asc' }, { productId: 'asc' }] },
} as const satisfies Prisma.OrderInclude;

// `id` ends the order so pages are stable when several orders share a timestamp.
const NEWEST_FIRST: Prisma.OrderOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];

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

export interface AdminOrderFilter {
  status?: OrderStatus;
  createdAt?: CreatedAtRange;
  /** Part of the customer's email, matched case-insensitively and literally. */
  customerEmail?: string;
}

/** What a status change writes besides the status itself. */
export interface StatusChange {
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentRef?: string;
  cancelReason?: CancelReason;
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** An order of this customer; another customer's order is simply not found. */
  findOwn(
    userId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderWithItems | null> {
    return (tx ?? this.prisma).order.findFirst({ where: { id, userId }, include: WITH_ITEMS });
  }

  /** Any order, whoever owns it: for the system's own work (payment processing). */
  findById(id: string, tx?: Prisma.TransactionClient): Promise<OrderWithItems | null> {
    return (tx ?? this.prisma).order.findUnique({ where: { id }, include: WITH_ITEMS });
  }

  /** Any order, with its customer: for administrators. */
  findWithCustomer(id: string, tx?: Prisma.TransactionClient): Promise<OrderWithCustomer | null> {
    return (tx ?? this.prisma).order.findUnique({
      where: { id },
      include: { ...WITH_ITEMS, user: CUSTOMER_SELECT },
    });
  }

  async findOwnPage(
    userId: string,
    status: OrderStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: OrderSummaryRow[]; total: number }> {
    const where: Prisma.OrderWhereInput = { userId, ...(status && { status }) };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ITEMS_COUNT,
        orderBy: NEWEST_FIRST,
        skip,
        take,
      }),
    ]);
    return { items, total };
  }

  async findPage(
    { status, createdAt, customerEmail }: AdminOrderFilter,
    skip: number,
    take: number,
  ): Promise<{ items: AdminOrderSummaryRow[]; total: number }> {
    const where: Prisma.OrderWhereInput = {
      ...(status && { status }),
      ...(createdAt && { createdAt }),
      ...(customerEmail && {
        user: { email: { contains: escapeLike(customerEmail), mode: 'insensitive' } },
      }),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { ...ITEMS_COUNT, user: CUSTOMER_SELECT },
        orderBy: NEWEST_FIRST,
        skip,
        take,
      }),
    ]);
    return { items, total };
  }

  /**
   * Ids of orders that are still NEW although they were placed before `before`: their payment
   * should have been processed by now. Oldest first, served by the (status, created_at) index.
   */
  async findStaleNewIds(before: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.order.findMany({
      where: { status: OrderStatus.NEW, createdAt: { lt: before } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.id);
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

  /**
   * Moves the order out of `from`, and reports whether this call did it. `false` means the order
   * was no longer in `from`: another request changed it first.
   *
   * Concurrency: the status check is the WHERE clause of the UPDATE itself, so a read followed by
   * a write can never act on a stale status. The UPDATE locks the row; a concurrent change of the
   * same order waits for this transaction, and PostgreSQL then re-evaluates the WHERE clause
   * against the newly committed row (at READ COMMITTED), which no longer matches. Of any number
   * of racing requests exactly one gets `true`, so whatever must happen once per change (the
   * restock of a cancellation) is done only by that one.
   */
  async changeStatus(
    id: string,
    from: OrderStatus,
    change: StatusChange,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const { count } = await tx.order.updateMany({ where: { id, status: from }, data: change });
    return count === 1;
  }

  /**
   * Turns the void of an order that was cancelled while its payment was being charged into a
   * refund, and records the charge's reference. `false` when the order is not in that state
   * (nothing to refund, or already refunded): the conditional UPDATE makes this safe to repeat.
   */
  async markRefunded(id: string, paymentRef: string): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.VOIDED },
      data: { paymentStatus: PaymentStatus.REFUNDED, paymentRef },
    });
    return count === 1;
  }
}
