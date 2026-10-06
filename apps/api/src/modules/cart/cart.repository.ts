import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { CartLine } from './build-cart-response';

export interface LockedCartItem {
  productId: string;
  quantity: number;
}

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's lines with product facts; archived products are included on purpose. */
  findLines(userId: string): Promise<CartLine[]> {
    return this.prisma.cartItem.findMany({
      where: { userId },
      // A fixed order keeps the cart from shuffling between reads.
      orderBy: [{ createdAt: 'asc' }, { productId: 'asc' }],
      select: {
        productId: true,
        quantity: true,
        product: {
          select: { name: true, imageUrl: true, price: true, stock: true, deletedAt: true },
        },
      },
    });
  }

  async findQuantity(userId: string, productId: string): Promise<number | null> {
    const line = await this.prisma.cartItem.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { quantity: true },
    });
    return line?.quantity ?? null;
  }

  countLines(userId: string): Promise<number> {
    return this.prisma.cartItem.count({ where: { userId } });
  }

  /**
   * Adds `delta` to the line (creating it if needed) in one statement, so two simultaneous adds
   * both count: a read-then-write would lose one of them. The CHECK on `quantity` (1..99) still
   * guards the result if racing requests both passed the service's friendly pre-check.
   */
  async addQuantity(userId: string, productId: string, delta: number): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO cart_items (user_id, product_id, quantity, created_at, updated_at)
      VALUES (${userId}::uuid, ${productId}::uuid, ${delta}::int, now(), now())
      ON CONFLICT (user_id, product_id)
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = now()`;
  }

  /** Sets the line to exactly `quantity`; the same request repeated has the same effect. */
  async setQuantity(userId: string, productId: string, quantity: number): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO cart_items (user_id, product_id, quantity, created_at, updated_at)
      VALUES (${userId}::uuid, ${productId}::uuid, ${quantity}::int, now(), now())
      ON CONFLICT (user_id, product_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`;
  }

  async removeLine(userId: string, productId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId, productId } });
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
  }

  /**
   * Locks all of the user's cart rows until the transaction ends and returns them in product-id
   * order. Concurrent checkouts of the same user queue up here (a double click, two tabs): the
   * second one waits, then finds the cart already emptied. Only cart rows are locked, with no join
   * to products, so product rows are never locked in an uncontrolled order.
   */
  lockForCheckout(userId: string, tx: Prisma.TransactionClient): Promise<LockedCartItem[]> {
    return tx.$queryRaw<LockedCartItem[]>`
      SELECT product_id AS "productId", quantity
      FROM cart_items
      WHERE user_id = ${userId}::uuid
      ORDER BY product_id
      FOR UPDATE`;
  }

  /** Deletes only the given lines: one added from another tab during checkout stays. */
  async removeLines(
    userId: string,
    productIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.cartItem.deleteMany({ where: { userId, productId: { in: productIds } } });
  }
}
