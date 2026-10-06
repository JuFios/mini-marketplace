import type { Product } from '@/shared/api/types';
import { ProductCard } from './product-card';

const GRID = 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export interface ProductGridProps {
  products: Product[];
  onAddToCart?: (product: Product) => void;
}

export function ProductGrid({ products, onAddToCart }: ProductGridProps) {
  return (
    <ul className={GRID}>
      {products.map((product) => (
        <li key={product.id} className="flex *:w-full">
          <ProductCard product={product} {...(onAddToCart && { onAddToCart })} />
        </li>
      ))}
    </ul>
  );
}

/** Same shape as the grid, so the page does not jump when the products arrive. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={GRID} aria-busy="true" aria-label="Loading products">
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white"
        />
      ))}
    </ul>
  );
}
