import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { runExclusive } from './exclusive-lock';
import { toApiError } from './errors';
import { createSession, type Session } from './session';
import type { AuthResponse } from './types';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Set on a request that is being replayed after a token refresh, so it is replayed only once. */
    authRetried?: boolean;
  }
}

export interface ApiClient {
  http: AxiosInstance;
  session: Session;
}

export interface ApiClientOptions {
  baseURL: string;
  /** Replaces the network layer; tests use it to script the server. */
  adapter?: AxiosAdapter;
  runExclusive?: <T>(task: () => Promise<T>) => Promise<T>;
}

// Calls to these use the refresh cookie or are how a token is obtained: they never carry a bearer
// token, and a 401 from them is an answer (wrong password, dead cookie), not an expired token.
function isAuthEndpoint(url: string | undefined): boolean {
  return url?.startsWith('/auth/') ?? false;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const http = axios.create({
    baseURL: options.baseURL,
    adapter: options.adapter,
    withCredentials: true,
  });

  const session = createSession({
    requestRefresh: async () => (await http.post<AuthResponse>('/auth/refresh')).data,
    runExclusive: options.runExclusive ?? runExclusive,
  });

  http.interceptors.request.use((config) => {
    const token = session.getAccessToken();
    if (token && !isAuthEndpoint(config.url)) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  async function replayAfterRefresh(
    error: unknown,
    config: InternalAxiosRequestConfig,
  ): Promise<AxiosResponse<unknown>> {
    config.authRetried = true;

    // Another request may already have refreshed while this one was in flight: its token is
    // outdated but a new one exists, so a second rotation would be wasted.
    const sent = config.headers.get('Authorization');
    const current = session.getAccessToken();
    const alreadyRefreshed = current !== null && sent !== `Bearer ${current}`;

    if (!alreadyRefreshed) {
      try {
        await session.refresh();
      } catch (refreshError) {
        // A dead refresh token means this 401 stands; anything else (network, 5xx) is more useful.
        throw toApiError(refreshError).status === 401 ? toApiError(error) : refreshError;
      }
    }
    // The request interceptor attaches the new token when the request goes out again.
    return http.request(config);
  }

  http.interceptors.response.use(undefined, (error: unknown) => {
    // Aborted requests (TanStack Query cancels superseded ones) must stay what they are.
    if (axios.isCancel(error)) throw error;

    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config &&
      !error.config.authRetried &&
      !isAuthEndpoint(error.config.url) &&
      // Without a token there is no session to refresh (and no point in looping).
      error.config.headers.has('Authorization')
    ) {
      return replayAfterRefresh(error, error.config);
    }
    throw toApiError(error);
  });

  return { http, session };
}
