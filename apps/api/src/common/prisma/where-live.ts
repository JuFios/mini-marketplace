import type { Prisma } from '../../generated/prisma/client';

/**
 * Filter for products that are not archived. Products are never hard-deleted (order history
 * references them), so every query that serves customers must go through this one definition.
 */
export function whereLive(): Prisma.ProductWhereInput {
  return { deletedAt: null };
}
