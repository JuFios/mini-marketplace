import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Role } from '@/shared/api/types';
import { RequireAuth } from './require-auth';
import { useAuth } from './use-auth';

/**
 * Lets only people with `role` through. This is for the interface only: the API enforces roles
 * itself and answers 403 whatever the UI shows.
 */
export function RequireRole({ role, children }: { role: Role; children?: ReactNode }) {
  const { user } = useAuth();

  if (user && user.role !== role) return <Navigate to="/" replace />;
  return <RequireAuth>{children}</RequireAuth>;
}
