import type { Cart, CartItem, Product } from '@/shared/api/types';
import { fromCents, toCents } from '@/shared/lib/money';

// What the cart will probably look like once the server has accepted a change, computed locally
// so the screen can show it at once. The server's answer replaces it; these only need to be close.
// Money is summed in integer cents.

function withQuantity(item: CartItem, quantity: number): CartItem {
  return {
    ...item,
    quantity,
    lineTotal: fromCents(toCents(item.unitPrice) * quantity),
    exceedsStock: quantity > item.stock,
  };
}

function summarize(items: CartItem[]): Cart {
  return {
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: fromCents(items.reduce((sum, item) => sum + toCents(item.lineTotal), 0)),
    hasIssues: items.some((item) => !item.isAvailable || item.exceedsStock),
  };
}

export function addItem(cart: Cart, product: Product, quantity: number): Cart {
  const existing = cart.items.find((item) => item.productId === product.id);
  if (existing) {
    return summarize(
      cart.items.map((item) =>
        item === existing ? withQuantity(item, item.quantity + quantity) : item,
      ),
    );
  }
  const added = withQuantity(
    {
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      unitPrice: product.price,
      quantity: 0,
      lineTotal: '0.00',
      stock: product.stock,
      isAvailable: true,
      exceedsStock: false,
    },
    quantity,
  );
  return summarize([...cart.items, added]);
}

export function setItemQuantity(cart: Cart, productId: string, quantity: number): Cart {
  return summarize(
    cart.items.map((item) => (item.productId === productId ? withQuantity(item, quantity) : item)),
  );
}

export function removeItem(cart: Cart, productId: string): Cart {
  return summarize(cart.items.filter((item) => item.productId !== productId));
}

export function emptyCart(): Cart {
  return summarize([]);
}
