import { runExclusive as defaultRunExclusive } from './exclusive-lock';
import { ApiError, toApiError } from './errors';
import type { AuthResponse, User } from './types';

export type SessionState =
  /** The first refresh (restoring the session after a page load) has not settled yet. */
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous' }
  /** Whether a session exists is unknown: the first refresh failed for a reason other than 401. */
  | { status: 'unavailable'; error: ApiError };

type Listener = () => void;

export interface Session {
  getState: () => SessionState;
  /** The access token lives only here, in memory: never in Web Storage, never readable by a cookie. */
  getAccessToken: () => string | null;
  /** Compatible with `useSyncExternalStore`. */
  subscribe: (listener: Listener) => () => void;
  /** Called when a session that was in use ends because the refresh token was rejected. */
  onExpired: (listener: Listener) => () => void;
  /** Adopts a login/registration/refresh result. */
  start: (auth: AuthResponse) => void;
  /** Ends the session locally (logout). */
  end: () => void;
  /**
   * Exchanges the refresh cookie for a new access token. Calls made while one is in flight share
   * it, so a burst of 401s costs one rotation. A rejected refresh token (401) ends the session; any
   * other failure leaves it untouched, because the server may well still consider it valid.
   */
  refresh: () => Promise<AuthResponse>;
  /** Restores the session once on page load; retryable after `unavailable`. */
  bootstrap: () => Promise<void>;
}

export interface SessionOptions {
  requestRefresh: () => Promise<AuthResponse>;
  runExclusive?: <T>(task: () => Promise<T>) => Promise<T>;
}

export function createSession({
  requestRefresh,
  runExclusive = defaultRunExclusive,
}: SessionOptions): Session {
  let state: SessionState = { status: 'loading' };
  let accessToken: string | null = null;
  let inflightRefresh: Promise<AuthResponse> | null = null;
  let inflightBootstrap: Promise<void> | null = null;
  const listeners = new Set<Listener>();
  const expiredListeners = new Set<Listener>();

  function setState(next: SessionState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function start(auth: AuthResponse) {
    accessToken = auth.accessToken;
    setState({ status: 'authenticated', user: auth.user });
  }

  function end() {
    accessToken = null;
    setState({ status: 'anonymous' });
  }

  function expire() {
    const wasInUse = state.status === 'authenticated';
    end();
    if (wasInUse) expiredListeners.forEach((listener) => listener());
  }

  function refresh(): Promise<AuthResponse> {
    inflightRefresh ??= runExclusive(requestRefresh)
      .then(
        (auth) => {
          start(auth);
          return auth;
        },
        (error: unknown) => {
          const apiError = toApiError(error);
          if (apiError.status === 401) expire();
          throw apiError;
        },
      )
      .finally(() => {
        inflightRefresh = null;
      });
    return inflightRefresh;
  }

  async function restore() {
    if (state.status === 'unavailable') setState({ status: 'loading' });
    try {
      await refresh();
    } catch (error) {
      const apiError = toApiError(error);
      // A 401 already moved the state to `anonymous`.
      if (apiError.status !== 401) setState({ status: 'unavailable', error: apiError });
    }
  }

  function bootstrap(): Promise<void> {
    if (state.status === 'authenticated' || state.status === 'anonymous') {
      return Promise.resolve();
    }
    // StrictMode runs effects twice in development; both runs share one restore.
    inflightBootstrap ??= restore().finally(() => {
      inflightBootstrap = null;
    });
    return inflightBootstrap;
  }

  return {
    getState: () => state,
    getAccessToken: () => accessToken,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onExpired: (listener) => {
      expiredListeners.add(listener);
      return () => expiredListeners.delete(listener);
    },
    start,
    end,
    refresh,
    bootstrap,
  };
}
