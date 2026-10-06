import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@/shared/api/http-client';
import {
  apiError,
  authResponse,
  CUSTOMER,
  createFakeServer,
  deferred,
  type FakeHandler,
} from '@/test/fake-api';
import { AuthProvider } from './auth-provider';
import { useAuth } from './use-auth';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

const CREDENTIALS = { email: 'ann@example.com', password: 'secret123' };

function Probe() {
  const { user, login, logout } = useAuth();
  return (
    <>
      <p>{user ? `signed in as ${user.name}` : 'guest'}</p>
      <button type="button" onClick={() => void login(CREDENTIALS)}>
        login
      </button>
      <button type="button" onClick={() => void logout().catch(() => undefined)}>
        logout
      </button>
    </>
  );
}

function setup(handler: FakeHandler) {
  const server = createFakeServer(handler);
  const client = createApiClient({ baseURL: '/api/v1', adapter: server.adapter });
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { server, client, queryClient };
}

describe('AuthProvider', () => {
  it('shows a splash until the first refresh settles, then the app as a guest', async () => {
    const refresh = deferred<{ status: number; data?: unknown }>();
    setup(() => refresh.promise);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('guest')).not.toBeInTheDocument();

    refresh.resolve(apiError(401, 'REFRESH_TOKEN_INVALID'));

    expect(await screen.findByText('guest')).toBeInTheDocument();
  });

  it('restores the session from the refresh cookie on load', async () => {
    const { server } = setup(() => ({ status: 200, data: authResponse('abc') }));

    expect(await screen.findByText('signed in as Ann Lee')).toBeInTheDocument();
    expect(server.callsTo('/auth/refresh')).toHaveLength(1);
  });

  it('offers a retry when the server cannot be reached', async () => {
    let reachable = false;
    setup(() => (reachable ? { status: 200, data: authResponse('abc') } : 'network-error'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');

    reachable = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('signed in as Ann Lee')).toBeInTheDocument();
  });

  it('logs in and out', async () => {
    const { server } = setup((request) => {
      if (request.url === '/auth/refresh') return apiError(401, 'REFRESH_TOKEN_INVALID');
      if (request.url === '/auth/login') return { status: 200, data: authResponse('abc') };
      return { status: 204 };
    });
    await screen.findByText('guest');

    await userEvent.click(screen.getByRole('button', { name: 'login' }));
    expect(await screen.findByText('signed in as Ann Lee')).toBeInTheDocument();
    expect(server.callsTo('/auth/login')[0]?.body).toEqual(CREDENTIALS);

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByText('guest')).toBeInTheDocument();
    expect(server.callsTo('/auth/logout')).toHaveLength(1);
  });

  it('logs out locally even when the server cannot be told', async () => {
    const { client } = setup((request) =>
      request.url === '/auth/logout' ? 'network-error' : { status: 200, data: authResponse('abc') },
    );
    await screen.findByText('signed in as Ann Lee');

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    expect(await screen.findByText('guest')).toBeInTheDocument();
    expect(client.session.getAccessToken()).toBeNull();
  });

  it('drops cached data when the person leaves', async () => {
    const { queryClient } = setup((request) =>
      request.url === '/auth/logout' ? { status: 204 } : { status: 200, data: authResponse('abc') },
    );
    await screen.findByText('signed in as Ann Lee');
    queryClient.setQueryData(['cart'], { items: [] });

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    await screen.findByText('guest');

    expect(queryClient.getQueryData(['cart'])).toBeUndefined();
  });

  it('tells the person when the session expires', async () => {
    const { client } = setup((request) =>
      request.url === '/auth/refresh' && client.session.getAccessToken() !== null
        ? apiError(401, 'REFRESH_TOKEN_INVALID')
        : request.url === '/auth/refresh'
          ? { status: 200, data: authResponse('abc') }
          : apiError(401, 'UNAUTHORIZED'),
    );
    await screen.findByText(`signed in as ${CUSTOMER.name}`);

    await act(async () => {
      await client.http.get('/cart').catch(() => undefined);
    });

    expect(await screen.findByText('guest')).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith('Your session has expired. Please log in again.');
  });
});
