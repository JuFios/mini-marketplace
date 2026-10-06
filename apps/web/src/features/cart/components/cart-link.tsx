import { NavLink } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { useCartQuery } from '../queries';

/** The header link to the cart, with the number of items in it once known. */
export function CartLink() {
  const { data } = useCartQuery();
  const count = data?.totalQuantity ?? 0;

  return (
    <NavLink
      to="/cart"
      aria-label={count > 0 ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}
      className={({ isActive }) =>
        cn(
          'inline-flex items-center gap-2 text-sm font-medium hover:text-brand-600',
          isActive ? 'text-brand-600' : 'text-slate-700',
        )
      }
    >
      Cart
      {count > 0 && (
        <span
          aria-hidden="true"
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
}
