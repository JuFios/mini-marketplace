import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { authPath } from './return-to';
import { useAuth } from './use-auth';

/** Lets only logged-in people through; others go to the login page and come back afterwards. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    const here = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={authPath('/login', here)} replace />;
  }
  return children ?? <Outlet />;
}
