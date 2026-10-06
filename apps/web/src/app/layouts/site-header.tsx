import { Link, NavLink, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { UserMenu } from '@/features/auth/components/user-menu';
import { CartLink } from '@/features/cart/components/cart-link';
import { useAuth } from '@/features/auth/use-auth';
import { buttonStyles } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

export function SiteHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    // Leave first: the moment the session ends, pages that need one would send the person to the
    // login page, which is not where someone who just logged out expects to land.
    void navigate('/');
    logout().catch(() =>
      toast.error('You were logged out here, but the server could not be reached.'),
    );
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link to="/" className="text-lg font-bold whitespace-nowrap text-brand-600">
            Mini Marketplace
          </Link>
          <nav aria-label="Main" className="flex items-center gap-6">
            {user?.role === 'ADMIN' ? (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  cn(
                    'text-sm font-medium hover:text-brand-600',
                    isActive ? 'text-brand-600' : 'text-slate-700',
                  )
                }
              >
                Admin
              </NavLink>
            ) : (
              <CartLink />
            )}
          </nav>
        </div>
        {user ? (
          <UserMenu user={user} onLogout={handleLogout} />
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login" className={buttonStyles('ghost')}>
              Log in
            </Link>
            <Link to="/register" className={buttonStyles('primary')}>
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
