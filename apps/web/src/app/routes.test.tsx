import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '@/features/auth/auth-provider';
import { createApiClient } from '@/shared/api/http-client';
import type { User } from '@/shared/api/types';
import { ADMIN, apiError, authResponse, CUSTOMER, createFakeServer } from '@/test/fake-api';
import { createQueryClient } from './query-client';
import { routes } from './routes';

/**
 * The whole app (providers, router, guards, forms) over a scripted API. `session` is who the
 * refresh cookie belongs to on load: nobody, or a user.
 */
function renderApp(path: string, session: User | null = null) {
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
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider client={client}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { server, router };
}

describe('login flow', () => {
  it('sends an anonymous visitor from a customer page to the login and back after logging in', async () => {
    const { router } = renderApp('/cart');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?returnTo=%2Fcart');

    await userEvent.type(screen.getByLabelText('Email'), 'ann@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cart');
    expect(screen.getByRole('button', { name: CUSTOMER.name })).toBeInTheDocument();
  });

  it('shows the registration form with a link back to the login', async () => {
    renderApp('/register');

    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
    // The header has a "Log in" link too; this is the one under the form.
    const form = within(screen.getByRole('main'));
    expect(form.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('keeps a logged-in person off the login page', async () => {
    const { router } = renderApp('/login', CUSTOMER);

    expect(
      await screen.findByRole('heading', { name: 'The catalog is on its way' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('session on load', () => {
  it('shows the logged-in user after a page reload', async () => {
    renderApp('/', CUSTOMER);

    expect(await screen.findByRole('button', { name: CUSTOMER.name })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('shows the login links to a visitor', async () => {
    renderApp('/');

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });
});

describe('logout', () => {
  it('returns to the home page rather than bouncing to the login page', async () => {
    const { router, server } = renderApp('/cart', CUSTOMER);
    await userEvent.click(await screen.findByRole('button', { name: CUSTOMER.name }));

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(server.callsTo('/auth/logout')).toHaveLength(1);
  });
});

describe('role-based routes', () => {
  it('keeps a customer out of the admin area', async () => {
    const { router } = renderApp('/admin', CUSTOMER);

    expect(
      await screen.findByRole('heading', { name: 'The catalog is on its way' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('lets an administrator into the lazy-loaded admin area', async () => {
    renderApp('/admin', ADMIN);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('keeps an administrator out of the customer pages', async () => {
    const { router } = renderApp('/cart', ADMIN);

    expect(
      await screen.findByRole('heading', { name: 'The catalog is on its way' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends an anonymous visitor from the admin area to the login', async () => {
    const { router } = renderApp('/admin');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?returnTo=%2Fadmin');
  });
});

describe('unknown routes', () => {
  it('shows the not-found page inside the layout', async () => {
    renderApp('/no/such/page');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mini Marketplace' })).toBeInTheDocument();
  });
});
