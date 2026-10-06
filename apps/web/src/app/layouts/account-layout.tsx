import { RequireRole } from '@/features/auth/require-role';

/**
 * Pages of a signed-in customer (cart, checkout, orders). Administrators do not shop: the API
 * refuses them on these routes, so the interface does not offer them either.
 */
export function AccountLayout() {
  return <RequireRole role="CUSTOMER" />;
}
