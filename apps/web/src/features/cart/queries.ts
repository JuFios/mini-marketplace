import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/use-auth';
import { getErrorMessage } from '@/shared/api/error-messages';
import type { Cart, Product } from '@/shared/api/types';
import { addCartItem, clearCart, fetchCart, removeCartItem, setCartItemQuantity } from './api';
import { addItem, emptyCart, removeItem, setItemQuantity } from './optimistic';

export const cartKeys = {
  all: ['cart'] as const,
  mutation: ['cart', 'mutation'] as const,
};

/** The cart of the logged-in customer; nothing is fetched for anyone else (administrators cannot shop). */
export function useCartQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: cartKeys.all,
    queryFn: ({ signal }) => fetchCart(signal),
    enabled: user?.role === 'CUSTOMER',
  });
}

interface CartMutationOptions<TVariables> {
  request: (variables: TVariables) => Promise<Cart>;
  /** The cart as it will probably be once `request` succeeds. */
  predict: (cart: Cart, variables: TVariables) => Cart;
  onSuccess?: (variables: TVariables) => void;
}

/**
 * An optimistic cart mutation:
 *  1. `onMutate` shows the predicted cart immediately (after stopping any refetch that could
 *     overwrite it);
 *  2. on failure the previous cart comes back and the reason is shown;
 *  3. on success the server's cart replaces the prediction.
 *
 * All cart mutations share one `scope`, so they run one after another in the order they were
 * made: responses cannot arrive out of order and overwrite newer state. Only the last of a burst
 * writes the server's cart (an earlier answer would briefly undo the changes queued behind it),
 * and a failure in the last one refetches, because snapshots taken mid-burst may be stale.
 */
function useCartMutation<TVariables>({
  request,
  predict,
  onSuccess,
}: CartMutationOptions<TVariables>) {
  const queryClient = useQueryClient();
  const isLastInFlight = () => queryClient.isMutating({ mutationKey: cartKeys.mutation }) === 1;

  return useMutation({
    mutationKey: cartKeys.mutation,
    scope: { id: 'cart' },
    mutationFn: request,
    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey: cartKeys.all });
      const previous = queryClient.getQueryData<Cart>(cartKeys.all);
      // Without a loaded cart there is nothing to predict from; the server's answer fills it in.
      if (previous) queryClient.setQueryData(cartKeys.all, predict(previous, variables));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(cartKeys.all, context.previous);
      toast.error(getErrorMessage(error));
      if (isLastInFlight()) void queryClient.invalidateQueries({ queryKey: cartKeys.all });
    },
    onSuccess: (cart, variables) => {
      if (isLastInFlight()) queryClient.setQueryData(cartKeys.all, cart);
      onSuccess?.(variables);
    },
  });
}

export function useAddCartItem() {
  return useCartMutation<{ product: Product; quantity: number }>({
    request: ({ product, quantity }) => addCartItem(product.id, quantity),
    predict: (cart, { product, quantity }) => addItem(cart, product, quantity),
    onSuccess: ({ product }) => toast.success(`Added “${product.name}” to your cart`),
  });
}

export function useSetCartItemQuantity() {
  return useCartMutation<{ productId: string; quantity: number }>({
    request: ({ productId, quantity }) => setCartItemQuantity(productId, quantity),
    predict: (cart, { productId, quantity }) => setItemQuantity(cart, productId, quantity),
  });
}

export function useRemoveCartItem() {
  return useCartMutation<{ productId: string }>({
    request: ({ productId }) => removeCartItem(productId),
    predict: (cart, { productId }) => removeItem(cart, productId),
  });
}

export function useClearCart() {
  return useCartMutation<void>({
    request: () => clearCart(),
    predict: () => emptyCart(),
  });
}
