/**
 * Returns the lines in the one order in which any transaction may lock several product rows:
 * ascending product id. Two transactions that lock rows in the same global order can never wait
 * for each other in a cycle, which is what keeps checkouts (and restocks) free of deadlocks.
 *
 * Plain code-unit comparison, never `localeCompare` (its order depends on the locale). For the
 * canonical lower-case UUID strings PostgreSQL returns, it matches the database's own uuid order.
 */
export function inLockOrder<T extends { productId: string }>(lines: readonly T[]): T[] {
  return [...lines].sort((a, b) => {
    if (a.productId === b.productId) return 0;
    return a.productId < b.productId ? -1 : 1;
  });
}
