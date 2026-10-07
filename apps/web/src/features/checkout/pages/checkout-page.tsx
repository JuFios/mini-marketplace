import { Link, useNavigate } from 'react-router';
import { useCartQuery } from '@/features/cart/queries';
import type { Cart } from '@/shared/api/types';
import { Alert, EmptyState, QueryBoundary, buttonStyles } from '@/shared/ui';
import { CheckoutForm } from '../components/checkout-form';
import { CheckoutSummary } from '../components/checkout-summary';
import { useCheckout } from '../queries';
import type { ShippingValues } from '../schemas';
import { useIdempotencyKey } from '../use-idempotency-key';

/**
 * What makes one purchase different from another: which products, how many of each, and where
 * they are sent. A product id never contains `|`, so the two parts cannot run into each other.
 */
function purchase(cart: Cart | undefined, shippingAddress: string): string {
  const lines = cart?.items.map((item) => `${item.productId}:${item.quantity}`).join(',') ?? '';
  return `${lines}|${shippingAddress}`;
}

export function CheckoutPage() {
  const cart = useCartQuery();
  const checkout = useCheckout();
  const navigate = useNavigate();
  const nextKey = useIdempotencyKey();

  async function placeOrder({ shippingAddress }: ShippingValues) {
    const order = await checkout.mutateAsync({
      shippingAddress,
      // Already trimmed by the form's schema, as the server trims it before comparing.
      idempotencyKey: nextKey(purchase(cart.data, shippingAddress)),
    });
    // Awaited, so the form stays busy until the order page is there: no second click can land in
    // between.
    await navigate(`/orders/${order.id}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Checkout</h1>
      <QueryBoundary
        query={cart}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title="Your cart is empty"
            description="There is nothing to check out. Orders you have already placed are under Orders."
            action={
              <Link to="/" className={buttonStyles('primary')}>
                Browse products
              </Link>
            }
          />
        }
      >
        {(data) => (
          <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
            <div className="space-y-4">
              {data.hasIssues && (
                <Alert>
                  Some items are unavailable or exceed the available stock.{' '}
                  <Link to="/cart" className="font-medium underline">
                    Update your cart
                  </Link>{' '}
                  before paying.
                </Alert>
              )}
              <CheckoutForm onSubmit={placeOrder} disabled={data.hasIssues} />
            </div>
            <CheckoutSummary cart={data} />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
