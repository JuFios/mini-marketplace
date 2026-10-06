import { OrderStatus } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/infra/prisma/prisma.service';

/**
 * Asserts that no unit was created or lost, per product:
 *
 *   stock_initial = stock_now + Σ quantity sold
 *
 * "Sold" counts the lines of every order that was not cancelled (a cancellation puts its units
 * back). `initialStock` maps product ids to their stock before the operations under test, which
 * must start without orders for these products.
 */
export async function expectStockInvariant(
  prisma: PrismaService,
  initialStock: Record<string, number>,
): Promise<void> {
  const productIds = Object.keys(initialStock);
  const [products, sold] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, order: { status: { not: OrderStatus.CANCELLED } } },
      _sum: { quantity: true },
    }),
  ]);
  const soldByProduct = new Map(sold.map((row) => [row.productId, row._sum.quantity ?? 0]));

  const accountedFor = Object.fromEntries(
    products.map((product) => [product.id, product.stock + (soldByProduct.get(product.id) ?? 0)]),
  );
  expect(accountedFor).toEqual(initialStock);
  for (const product of products) expect(product.stock).toBeGreaterThanOrEqual(0);
}
