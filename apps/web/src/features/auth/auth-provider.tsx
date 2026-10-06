import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/shared/api/client';
import { getErrorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/errors';
import type { ApiClient } from '@/shared/api/http-client';
import { ErrorState, SplashScreen } from '@/shared/ui';
import { AuthContext, type AuthContextValue } from './auth-context';
import { createAuthService } from './auth-service';

export interface AuthProviderProps {
  client?: ApiClient;
  children: ReactNode;
}

/**
 * Restores the session (one refresh call) before the app renders, so every screen can rely on
 * `useAuth().user` being settled; until then it shows a splash, or a retry if the API is unreachable.
 */
export function AuthProvider({ client = apiClient, children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const { session } = client;
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const service = useMemo(() => createAuthService(client), [client]);

  useEffect(() => {
    void session.bootstrap();
  }, [session]);

  useEffect(
    () => session.onExpired(() => toast.info('Your session has expired. Please log in again.')),
    [session],
  );

  // Cached data belongs to whoever fetched it: when the person leaves or changes, so does it.
  const userId = state.status === 'authenticated' ? state.user.id : null;
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    if (previousUserId.current !== null && previousUserId.current !== userId) queryClient.clear();
    previousUserId.current = userId;
  }, [userId, queryClient]);

  const user = state.status === 'authenticated' ? state.user : null;
  const value = useMemo<AuthContextValue>(
    () => ({ user, login: service.login, register: service.register, logout: service.logout }),
    [user, service],
  );

  if (state.status === 'loading') return <SplashScreen />;

  if (state.status === 'unavailable') {
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorState
          title="Cannot load your session"
          message={getErrorMessage(state.error)}
          requestId={state.error instanceof ApiError ? state.error.requestId : undefined}
          onRetry={() => void session.bootstrap()}
        />
      </div>
    );
  }

  return <AuthContext value={value}>{children}</AuthContext>;
}
