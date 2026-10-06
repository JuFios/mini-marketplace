import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  authResponse,
  CUSTOMER,
  createFakeServer,
  type FakeHandler,
} from '@/test/fake-api';
import { createApiClient } from './http-client';

function setup(handler: FakeHandler, runExclusive?: <T>(task: () => Promise<T>) => Promise<T>) {
  const server = createFakeServer(handler);
  const client = createApiClient({
    baseURL: '/api/v1',
    adapter: server.adapter,
    ...(runExclusive && { runExclusive }),
  });
  return { ...client, server };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bootstrap', () => {
  it('restores a session from the refresh cookie', async () => {
    const { session } = setup(() => ({ status: 200, data: authResponse('abc') }));
    expect(session.getState()).toEqual({ status: 'loading' });

    await session.bootstrap();

    expect(session.getState()).toMatchObject({
      status: 'authenticated',
      user: { id: CUSTOMER.id },
    });
    expect(session.getAccessToken()).toBe('abc');
  });

  it('becomes anonymous, without an expiry notice, when there is no valid cookie', async () => {
    const { session } = setup(() => apiError(401, 'REFRESH_TOKEN_INVALID'));
    const onExpired = vi.fn();
    session.onExpired(onExpired);

    await session.bootstrap();

    expect(session.getState()).toEqual({ status: 'anonymous' });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('reports the session as unavailable when the server cannot be reached, and can be retried', async () => {
    let reachable = false;
    const { session } = setup(() =>
      reachable ? { status: 200, data: authResponse('abc') } : 'network-error',
    );

    await session.bootstrap();
    expect(session.getState()).toMatchObject({
      status: 'unavailable',
      error: { code: 'NETWORK_ERROR' },
    });

    reachable = true;
    await session.bootstrap();
    expect(session.getState().status).toBe('authenticated');
  });

  it('makes one request however many times it is asked', async () => {
    const { session, server } = setup(() => ({ status: 200, data: authResponse('abc') }));

    await Promise.all([session.bootstrap(), session.bootstrap()]);

    expect(server.callsTo('/auth/refresh')).toHaveLength(1);
  });

  it('does nothing once the state is settled', async () => {
    const { session, server } = setup(() => ({ status: 200, data: authResponse('abc') }));
    await session.bootstrap();

    await session.bootstrap();

    expect(server.callsTo('/auth/refresh')).toHaveLength(1);
  });
});

describe('access token storage', () => {
  it('never reaches Web Storage', async () => {
    const { session } = setup(() => ({ status: 200, data: authResponse('secret-token') }));

    await session.bootstrap();
    session.start(authResponse('another-secret'));

    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('is forgotten when the session ends', () => {
    const { session } = setup(() => ({ status: 200 }));
    session.start(authResponse('abc'));

    session.end();

    expect(session.getAccessToken()).toBeNull();
    expect(session.getState()).toEqual({ status: 'anonymous' });
  });
});

describe('refresh', () => {
  it('runs under the cross-tab lock', async () => {
    const request = vi.fn(<T>(_name: string, task: () => Promise<T>) => task());
    vi.stubGlobal('navigator', { locks: { request } });
    const { session } = setup(() => ({ status: 200, data: authResponse('abc') }));

    await session.refresh();

    expect(request).toHaveBeenCalledWith('auth-refresh', expect.any(Function));
  });

  it('notifies subscribers of every change', async () => {
    const { session } = setup(() => ({ status: 200, data: authResponse('abc') }));
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    await session.refresh();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    session.end();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
