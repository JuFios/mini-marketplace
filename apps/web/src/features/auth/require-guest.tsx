import type { ReactNode } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router';
import { safeReturnTo } from './return-to';
import { useAuth } from './use-auth';

/** For the login and registration pages: a logged-in person has no business there. */
export function RequireGuest({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const [params] = useSearchParams();

  if (user) return <Navigate to={safeReturnTo(params.get('returnTo'))} replace />;
  return children ?? <Outlet />;
}
