import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { inLockOrder } from './lock-order';

/** A product row as left by a successful decrement; the transaction now holds its row lock. */
export interface DecrementedProduct {
  id: string;
  name: string;
  price: Prisma.Decimal;
}

export interface StockLine {
  productId: string;
  quantity: number;
}

export interface ProductStockState {
  name: string;
  stock: number;
  deletedAt: Date | null;
}

/**
 * The orders module's access to product inventory: apart from admin stock adjustments, the only
 * code that changes `products.stock`. Every method runs inside the caller's transaction.
 */
@Injectable()
export class InventoryRepository {
  /**
   * Takes `quantity` units of a live product and returns the row, or `null` when the product is
   * archived or has fewer units left; then nothing was changed.
   *
   * Concurrency: the stock check is the WHERE clause of the UPDATE itself, so there is no window
   * between checking and writing. The UPDATE locks the row: a concurrent checkout of the same
   * product waits for this transaction to end, and PostgreSQL then re-evaluates the WHERE clause
   * against the newly committed row (at READ COMMITTED). If the last unit is gone by then, the
   * condition is false and no row comes back. Stock therefore never goes below zero, and the
   * CHECK constraint `products_stock_non_negative` would reject it even if a future code path
   * tried. Because the lock is held until commit, the returned price cannot change before the
   * order is written: it is the price the customer pays.
   *
   * Raw SQL on purpose: the guarantee must be visible here, not depend on how an ORM compiles a
   * filter into a statement.
   */
  async decrementStock(
    productId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<DecrementedProduct | null> {
    const rows = await tx.$queryRaw<DecrementedProduct[]>`
      UPDATE products
      SET stock = stock - ${quantity}::int, updated_at = now()
      WHERE id = ${productId}::uuid AND deleted_at IS NULL AND stock >= ${quantity}::int
      RETURNING id, name, price`;
    return rows[0] ?? null;
  }

  /**
   * Puts units back, e.g. those of a cancelled order. Archived products are restocked too: the
   * units physically exist again. Rows are locked in the global lock order, like a checkout.
   */
  async restock(lines: readonly StockLine[], tx: Prisma.TransactionClient): Promise<void> {
    for (const line of inLockOrder(lines)) {
      await tx.$executeRaw`
        UPDATE products
        SET stock = stock + ${line.quantity}::int, updated_at = now()
        WHERE id = ${line.productId}::uuid`;
    }
  }

  /**
   * The current state of a product, read without a lock: used to explain why a decrement found
   * no row. Runs on the transaction's own connection so that a busy pool cannot stall it.
   */
  findStockState(
    productId: string,
    tx: Prisma.TransactionClient,
  ): Promise<ProductStockState | null> {
    return tx.product.findUnique({
      where: { id: productId },
      select: { name: true, stock: true, deletedAt: true },
    });
  }
}
