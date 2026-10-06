import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import type { AuthResponse, User } from '@/shared/api/types';

export interface RecordedRequest {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

export type FakeResult = { status: number; data?: unknown } | 'network-error';
export type FakeHandler = (request: RecordedRequest) => FakeResult | Promise<FakeResult>;

export const CUSTOMER: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ann@example.com',
  name: 'Ann Lee',
  role: 'CUSTOMER',
  createdAt: '2026-10-05T12:00:00.000Z',
};

export const ADMIN: User = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'admin@example.com',
  name: 'Site Admin',
  role: 'ADMIN',
  createdAt: '2026-10-05T12:00:00.000Z',
};

export function authResponse(accessToken: string, user: User = CUSTOMER): AuthResponse {
  return { user, accessToken, expiresIn: 900 };
}

export function apiError(status: number, code: string, details?: unknown) {
  return {
    status,
    data: {
      statusCode: status,
      code,
      message: `${code} message`,
      details,
      requestId: 'req-1',
      timestamp: '2026-10-05T12:00:00.000Z',
      path: '/api/v1/x',
    },
  };
}

/**
 * Stands in for the network: every request goes to `handler`, which answers like the API would.
 * Status codes outside 2xx reject exactly as axios does, so interceptors see what they see in
 * production.
 */
export function createFakeServer(handler: FakeHandler) {
  const requests: RecordedRequest[] = [];

  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const authorization: unknown = config.headers.get('Authorization');
    const request: RecordedRequest = {
      method: (config.method ?? 'get').toUpperCase(),
      url: config.url ?? '',
      authorization: typeof authorization === 'string' ? authorization : undefined,
      body: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : undefined,
    };
    requests.push(request);

    const result = await handler(request);
    if (result === 'network-error') {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
    }

    const response = {
      data: result.data,
      status: result.status,
      statusText: '',
      headers: {},
      config,
    };
    if (result.status >= 200 && result.status < 300) return response;
    throw new AxiosError(
      `Request failed with status code ${result.status}`,
      result.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      undefined,
      response,
    );
  };

  return {
    adapter,
    requests,
    /** Requests made to `url`, in order. */
    callsTo: (url: string) => requests.filter((request) => request.url === url),
  };
}

/** A promise that is settled from outside, to hold a fake request in flight. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
