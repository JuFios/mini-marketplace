import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cartKeys } from '@/features/cart/queries';
import { catalogKeys } from '@/features/catalog/queries';
import { orderKeys } from '@/features/orders/queries';
import { placeOrder } from './api';
import { shouldRefreshCart } from './errors';

export function useCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      shippingAddress,
      idempotencyKey,
    }: {
      shippingAddress: string;
      idempotencyKey: string;
    }) => placeOrder(shippingAddress, idempotencyKey),
    onSuccess: (order) => {
      // The order page opens with the order already in hand instead of a spinner.
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      // The bought lines left the cart, but a line added in another tab meanwhile stayed: ask the
      // server rather than assume an empty cart.
      void queryClient.invalidateQueries({ queryKey: cartKeys.all });
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists });
      // Stock went down for everyone looking at the catalog.
      void queryClient.invalidateQueries({ queryKey: catalogKeys.products });
    },
    onError: (error) => {
      // Only a refusal of the cart itself: after a network error the order may exist, and a
      // refreshed (empty) cart would hide the page the customer needs to retry from.
      if (shouldRefreshCart(error)) void queryClient.invalidateQueries({ queryKey: cartKeys.all });
    },
  });
}
