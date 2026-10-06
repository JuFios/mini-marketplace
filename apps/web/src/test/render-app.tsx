import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '@/app/routes';
import { AuthProvider } from '@/features/auth/auth-provider';
import { createApiClient } from '@/shared/api/http-client';
import type { User } from '@/shared/api/types';
import { apiError, authResponse, CUSTOMER, createFakeServer } from './fake-api';

/**
 * The whole app (providers, router, guards, forms) over a scripted auth API. `session` is who the
 * refresh cookie belongs to on load: nobody, or a user. Pages fetch through feature `api` modules,
 * which each test file mocks.
 */
export function renderApp(path: string, session: User | null = null) {
  const server = createFakeServer((request) => {
    switch (request.url) {
      case '/auth/refresh':
        return session
          ? { status: 200, data: authResponse('t-restored', session) }
          : apiError(401, 'REFRESH_TOKEN_INVALID');
      case '/auth/login':
        return { status: 200, data: authResponse('t-login', CUSTOMER) };
      case '/auth/logout':
        return { status: 204 };
      default:
        return apiError(404, 'NOT_FOUND');
    }
  });
  const client = createApiClient({ baseURL: '/api/v1', adapter: server.adapter });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={client}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { server, router, queryClient };
}
