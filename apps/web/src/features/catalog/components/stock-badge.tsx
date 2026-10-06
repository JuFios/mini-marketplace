import { Badge } from '@/shared/ui';

/** From this many units down the badge warns that stock is running out. */
const LOW_STOCK = 5;

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <Badge tone="danger">Out of stock</Badge>;
  if (stock <= LOW_STOCK) return <Badge tone="warning">Only {stock} left</Badge>;
  return <Badge tone="success">In stock</Badge>;
}
