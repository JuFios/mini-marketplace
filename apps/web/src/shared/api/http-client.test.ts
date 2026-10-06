import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN,
  apiError,
  authResponse,
  createFakeServer,
  deferred,
  type FakeHandler,
} from '@/test/fake-api';
import { ApiError } from './errors';
import { createApiClient } from './http-client';

function setup(handler: FakeHandler) {
  const server = createFakeServer(handler);
  const client = createApiClient({ baseURL: '/api/v1', adapter: server.adapter });
  return { ...client, server };
}

/** Answers `/auth/refresh` with a fresh token each time, and `/things` only for that token. */
function serverThatAcceptsToken(valid: () => string): FakeHandler {
  let issued = 0;
  return (request) => {
    if (request.url === '/auth/refresh') {
      issued += 1;
      return { status: 200, data: authResponse(`token-${issued}`) };
    }
    return request.authorization === `Bearer ${valid()}`
      ? { status: 200, data: { ok: true } }
      : apiError(401, 'UNAUTHORIZED');
  };
}

describe('request interceptor', () => {
  it('sends the access token as a bearer header', async () => {
    const { http, session, server } = setup(() => ({ status: 200, data: {} }));
    session.start(authResponse('abc'));

    await http.get('/cart');

    expect(server.requests[0]?.authorization).toBe('Bearer abc');
  });

  it('keeps the token off the auth endpoints', async () => {
    const { http, session, server } = setup(() => ({ status: 204 }));
    session.start(authResponse('abc'));

    await http.post('/auth/logout');

    expect(server.requests[0]?.authorization).toBeUndefined();
  });
});

describe('401 handling', () => {
  it('refreshes once and replays the request with the new token', async () => {
    const { http, session, server } = setup(serverThatAcceptsToken(() => 'token-1'));
    session.start(authResponse('expired'));

    const response = await http.get<{ ok: boolean }>('/things');

    expect(response.data).toEqual({ ok: true });
    expect(server.callsTo('/auth/refresh')).toHaveLength(1);
    expect(server.callsTo('/things').map((call) => call.authorization)).toEqual([
      'Bearer expired',
      'Bearer token-1',
    ]);
    expect(session.getAccessToken()).toBe('token-1');
  });

  it('shares one refresh between simultaneous 401s', async () => {
    const { http, session, server } = setup(serverThatAcceptsToken(() => 'token-1'));
    session.start(authResponse('expired'));

    const responses = await Promise.all([
      http.get('/things'),
      http.get('/things'),
      http.get('/things'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(server.callsTo('/auth/refresh')).toHaveLength(1);
  });

  it('replays without refreshing when another request already did', async () => {
    const arrived = deferred<void>();
    const release = deferred<void>();
    const { http, session, server } = setup(async (request) => {
      if (request.authorization === 'Bearer old') {
        arrived.resolve();
        await release.promise;
        return apiError(401, 'UNAUTHORIZED');
      }
      return { status: 200, data: { ok: true } };
    });
    session.start(authResponse('old'));

    const pending = http.get('/things');
    await arrived.promise;
    // Meanwhile a refresh triggered by something else finishes.
    session.start(authResponse('new'));
    release.resolve();
    await pending;

    expect(server.callsTo('/auth/refresh')).toHaveLength(0);
    expect(server.callsTo('/things').map((call) => call.authorization)).toEqual([
      'Bearer old',
      'Bearer new',
    ]);
  });

  it('gives up after one replay and keeps the session', async () => {
    const { http, session, server } = setup((request) =>
      request.url === '/auth/refresh'
        ? { status: 200, data: authResponse('token-1') }
        : apiError(401, 'UNAUTHORIZED'),
    );
    session.start(authResponse('expired'));

    await expect(http.get('/things')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });

    expect(server.callsTo('/auth/refresh')).toHaveLength(1);
    expect(server.callsTo('/things')).toHaveLength(2);
    expect(session.getState().status).toBe('authenticated');
  });

  it('ends the session when the refresh token is rejected', async () => {
    const { http, session } = setup((request) =>
      request.url === '/auth/refresh'
        ? apiError(401, 'REFRESH_TOKEN_INVALID')
        : apiError(401, 'UNAUTHORIZED'),
    );
    session.start(authResponse('expired'));
    const onExpired = vi.fn();
    session.onExpired(onExpired);

    await expect(http.get('/things')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });

    expect(session.getState()).toEqual({ status: 'anonymous' });
    expect(session.getAccessToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('keeps the session and reports the network error when the refresh cannot be made', async () => {
    const { http, session } = setup((request) =>
      request.url === '/auth/refresh' ? 'network-error' : apiError(401, 'UNAUTHORIZED'),
    );
    session.start(authResponse('expired'));

    await expect(http.get('/things')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });

    expect(session.getState().status).toBe('authenticated');
  });

  it('does not treat a failed login as an expired token', async () => {
    const { http, session, server } = setup(() => apiError(401, 'INVALID_CREDENTIALS'));
    session.start(authResponse('abc'));

    await expect(http.post('/auth/login', {})).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    expect(server.callsTo('/auth/refresh')).toHaveLength(0);
  });

  it('does not refresh a request that carried no token', async () => {
    const { http, server } = setup(() => apiError(401, 'UNAUTHORIZED'));

    await expect(http.get('/things')).rejects.toMatchObject({ status: 401 });

    expect(server.callsTo('/auth/refresh')).toHaveLength(0);
  });

  it('takes the role from the refreshed session', async () => {
    const { http, session } = setup((request) =>
      request.url === '/auth/refresh'
        ? { status: 200, data: authResponse('token-1', ADMIN) }
        : request.authorization === 'Bearer token-1'
          ? { status: 200, data: {} }
          : apiError(401, 'UNAUTHORIZED'),
    );
    session.start(authResponse('expired'));

    await http.get('/things');

    expect(session.getState()).toMatchObject({ status: 'authenticated', user: { role: 'ADMIN' } });
  });
});

describe('error normalisation', () => {
  it('turns an API error envelope into an ApiError', async () => {
    const { http } = setup(() =>
      apiError(409, 'INSUFFICIENT_STOCK', [{ productId: 'p1', requested: 3, available: 1 }]),
    );

    const error: unknown = await http.get('/things').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      requestId: 'req-1',
      details: [{ productId: 'p1', requested: 3, available: 1 }],
    });
  });

  it('reports an unreachable server as NETWORK_ERROR', async () => {
    const { http } = setup(() => 'network-error');

    await expect(http.get('/things')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('keeps just the status of a response that is not an API error', async () => {
    const { http } = setup(() => ({ status: 502, data: '<html>Bad gateway</html>' }));

    await expect(http.get('/things')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
  });
});
