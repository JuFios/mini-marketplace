import { useLocation, useNavigate } from 'react-router';
import { authPath } from '@/features/auth/return-to';
import { useAuth } from '@/features/auth/use-auth';
import type { Product } from '@/shared/api/types';
import { useAddCartItem } from './queries';

/**
 * "Add to cart" for any page. A visitor is sent to log in and brought back here afterwards;
 * `canShop` is false for administrators, who have no cart (the API refuses them).
 */
export function useAddToCart() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate } = useAddCartItem();

  function addToCart(product: Product, quantity = 1) {
    if (!user) {
      void navigate(authPath('/login', `${location.pathname}${location.search}`));
      return;
    }
    mutate({ product, quantity });
  }

  return { addToCart, canShop: user?.role !== 'ADMIN' };
}
