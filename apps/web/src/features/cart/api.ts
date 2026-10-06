import { http } from '@/shared/api/client';
import type { Cart } from '@/shared/api/types';

// Every call answers with the whole cart: that is what lets the optimistic UI reconcile.

export async function fetchCart(signal?: AbortSignal): Promise<Cart> {
  const { data } = await http.get<Cart>('/cart', { signal });
  return data;
}

export async function addCartItem(productId: string, quantity: number): Promise<Cart> {
  const { data } = await http.post<Cart>('/cart/items', { productId, quantity });
  return data;
}

/** Sets the absolute quantity, so a repeated request does no harm. */
export async function setCartItemQuantity(productId: string, quantity: number): Promise<Cart> {
  const { data } = await http.patch<Cart>(`/cart/items/${encodeURIComponent(productId)}`, {
    quantity,
  });
  return data;
}

export async function removeCartItem(productId: string): Promise<Cart> {
  const { data } = await http.delete<Cart>(`/cart/items/${encodeURIComponent(productId)}`);
  return data;
}

export async function clearCart(): Promise<Cart> {
  const { data } = await http.delete<Cart>('/cart');
  return data;
}
