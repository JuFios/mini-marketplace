import { Link } from 'react-router';
import type { Product } from '@/shared/api/types';
import { Button, Price, Thumbnail } from '@/shared/ui';
import { StockBadge } from './stock-badge';

export interface ProductCardProps {
  product: Product;
  /** Omit where the viewer cannot buy (administrators): no button is shown. */
  onAddToCart?: (product: Product) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const href = `/products/${product.id}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* The name below is the accessible link; this one is for the pointer only. */}
      <Link to={href} tabIndex={-1} aria-hidden="true">
        <Thumbnail src={product.imageUrl} alt={product.name} className="aspect-square w-full" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs text-slate-500">{product.category.name}</p>
        <h2 className="line-clamp-2 font-medium text-slate-900">
          <Link to={href} className="hover:text-brand-600 hover:underline">
            {product.name}
          </Link>
        </h2>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Price value={product.price} className="text-lg font-semibold text-slate-900" />
          <StockBadge stock={product.stock} />
        </div>
        {onAddToCart && (
          <Button
            className="mt-2 w-full"
            disabled={product.stock <= 0}
            onClick={() => onAddToCart(product)}
          >
            {product.stock <= 0 ? 'Out of stock' : 'Add to cart'}
          </Button>
        )}
      </div>
    </article>
  );
}
