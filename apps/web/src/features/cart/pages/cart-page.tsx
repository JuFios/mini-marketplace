import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, Button, EmptyState, Modal, Price, QueryBoundary, buttonStyles } from '@/shared/ui';
import { CartItemRow } from '../components/cart-item-row';
import { useCartQuery, useClearCart, useRemoveCartItem, useSetCartItemQuantity } from '../queries';

export function CartPage() {
  const cart = useCartQuery();
  const setQuantity = useSetCartItemQuantity();
  const remove = useRemoveCartItem();
  const clear = useClearCart();
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Your cart</h1>
      <QueryBoundary
        query={cart}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title="Your cart is empty"
            description="Browse the catalog and add something you like."
            action={
              <Link to="/" className={buttonStyles('primary')}>
                Browse products
              </Link>
            }
          />
        }
      >
        {(data) => (
          <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              {data.hasIssues && (
                <Alert>
                  Some items are unavailable or exceed the available stock. Update or remove them
                  before checking out.
                </Alert>
              )}
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-4">
                {data.items.map((item) => (
                  <CartItemRow
                    key={item.productId}
                    item={item}
                    onQuantityChange={(quantity) =>
                      setQuantity.mutate({ productId: item.productId, quantity })
                    }
                    onRemove={() => remove.mutate({ productId: item.productId })}
                  />
                ))}
              </ul>
            </div>
            <aside className="h-fit space-y-4 rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Items</dt>
                  <dd>{data.totalQuantity}</dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>Subtotal</dt>
                  <dd>
                    <Price value={data.subtotal} />
                  </dd>
                </div>
              </dl>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(true)}>
                Clear cart
              </Button>
            </aside>
          </div>
        )}
      </QueryBoundary>
      <Modal
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        title="Clear your cart?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingClear(false)}>
              Keep items
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingClear(false);
                clear.mutate();
              }}
            >
              Clear cart
            </Button>
          </>
        }
      >
        All items will be removed from your cart.
      </Modal>
    </div>
  );
}
