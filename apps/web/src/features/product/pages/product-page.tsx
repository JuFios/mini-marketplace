import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { StockBadge } from '@/features/catalog/components/stock-badge';
import { useProductQuery } from '@/features/catalog/queries';
import { useAddToCart } from '@/features/cart/use-add-to-cart';
import { ApiError } from '@/shared/api/errors';
import type { Product } from '@/shared/api/types';
import {
  Badge,
  Button,
  EmptyState,
  Price,
  QuantityStepper,
  QueryBoundary,
  Spinner,
  Thumbnail,
  buttonStyles,
} from '@/shared/ui';

// The API caps a cart line at this many units.
const MAX_QUANTITY = 99;

function ProductDetails({ product }: { product: Product }) {
  const { addToCart, canShop } = useAddToCart();
  const [quantity, setQuantity] = useState(1);
  const max = Math.min(MAX_QUANTITY, product.stock);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Thumbnail
        src={product.imageUrl}
        alt={product.name}
        className="aspect-square w-full rounded-lg"
      />
      <div className="space-y-4">
        <Link to={`/?category=${product.category.id}`}>
          <Badge tone="info">{product.category.name}</Badge>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
        <div className="flex items-center gap-3">
          <Price value={product.price} className="text-2xl font-semibold text-slate-900" />
          <StockBadge stock={product.stock} />
        </div>
        <p className="whitespace-pre-line text-slate-700">{product.description}</p>
        {canShop && (
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <QuantityStepper
              label="Quantity"
              value={quantity}
              max={max}
              disabled={product.stock <= 0}
              onChange={setQuantity}
            />
            <Button disabled={product.stock <= 0} onClick={() => addToCart(product, quantity)}>
              {product.stock <= 0 ? 'Out of stock' : 'Add to cart'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProductPage() {
  const { id = '' } = useParams();
  const product = useProductQuery(id);

  // The API says 404 for an unknown or archived product and 400 for a malformed id; to a visitor
  // both are simply "no such product".
  if (product.error instanceof ApiError && [400, 404].includes(product.error.status)) {
    return (
      <EmptyState
        title="Product not found"
        description="It may have been removed or the link is wrong."
        action={
          <Link to="/" className={buttonStyles('primary')}>
            Back to the shop
          </Link>
        }
      />
    );
  }

  return (
    <QueryBoundary
      query={product}
      loading={<Spinner size="lg" className="mx-auto my-16 text-brand-600" />}
    >
      {(data) => <ProductDetails key={data.id} product={data} />}
    </QueryBoundary>
  );
}
