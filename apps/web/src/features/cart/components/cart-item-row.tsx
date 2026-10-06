import { Link } from 'react-router';
import type { CartItem } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { Button, Price, QuantityStepper, Thumbnail } from '@/shared/ui';

/** The most of one product a cart line can hold (an API rule). */
const MAX_QUANTITY = 99;

export interface CartItemRowProps {
  item: CartItem;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

export function CartItemRow({ item, onQuantityChange, onRemove }: CartItemRowProps) {
  const { name, isAvailable, exceedsStock, stock, quantity } = item;

  return (
    <li className={cn('flex gap-4 py-4', !isAvailable && 'opacity-70')}>
      <Thumbnail src={item.imageUrl} alt={name} className="size-20 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {isAvailable ? (
            <Link
              to={`/products/${item.productId}`}
              className="line-clamp-2 font-medium text-slate-900 hover:text-brand-600 hover:underline"
            >
              {name}
            </Link>
          ) : (
            <p className="line-clamp-2 font-medium text-slate-900">{name}</p>
          )}
          <p className="text-sm text-slate-600">
            <Price value={item.unitPrice} /> each
          </p>
          {!isAvailable && (
            <p className="text-sm font-medium text-red-600">
              This product is no longer available. Remove it to continue.
            </p>
          )}
          {isAvailable && exceedsStock && (
            <p className="text-sm font-medium text-red-600">
              {stock > 0
                ? `Only ${stock} in stock. Reduce the quantity.`
                : 'Out of stock. Remove it to continue.'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 sm:flex-col sm:items-end">
          <QuantityStepper
            label={`Quantity of ${name}`}
            value={quantity}
            max={Math.min(MAX_QUANTITY, stock)}
            disabled={!isAvailable}
            onChange={onQuantityChange}
          />
          <Price value={item.lineTotal} className="font-semibold text-slate-900" />
          <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${name}`}>
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
}
