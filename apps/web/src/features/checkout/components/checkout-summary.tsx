import type { Cart } from '@/shared/api/types';
import { Price, Thumbnail } from '@/shared/ui';

export function CheckoutSummary({ cart }: { cart: Cart }) {
  return (
    <section
      aria-labelledby="checkout-summary"
      className="h-fit space-y-4 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 id="checkout-summary" className="text-lg font-semibold text-slate-900">
        Order summary
      </h2>
      <ul className="divide-y divide-slate-200">
        {cart.items.map((item) => (
          <li key={item.productId} className="flex gap-3 py-3">
            <Thumbnail src={item.imageUrl} alt="" className="size-14 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="line-clamp-2 text-sm font-medium text-slate-900">{item.name}</p>
              <p className="text-sm text-slate-600">
                {item.quantity} × <Price value={item.unitPrice} />
              </p>
              {!item.isAvailable && (
                <p className="text-sm font-medium text-red-600">No longer available</p>
              )}
              {item.isAvailable && item.exceedsStock && (
                <p className="text-sm font-medium text-red-600">
                  {item.stock > 0 ? `Only ${item.stock} in stock` : 'Out of stock'}
                </p>
              )}
            </div>
            <Price value={item.lineTotal} className="text-sm font-semibold text-slate-900" />
          </li>
        ))}
      </ul>
      <dl className="space-y-2 border-t border-slate-200 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">Items</dt>
          <dd>{cart.totalQuantity}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd>
            <Price value={cart.subtotal} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
