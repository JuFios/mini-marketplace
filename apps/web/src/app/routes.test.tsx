import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN, CUSTOMER } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

// The pages fetch through these; the tests here are about routing, so they get empty answers.
vi.mock('@/features/catalog/api', () => ({
  fetchProducts: () =>
    Promise.resolve({ items: [], meta: { page: 1, limit: 12, total: 0, totalPages: 0 } }),
  fetchProduct: () => Promise.reject(new Error('not used')),
  fetchCategories: () => Promise.resolve([]),
}));
// The admin pages are lazy-loaded here too; they only need to find answers (none of their data matters).
// The chart library is a heavy first import, and these tests are about routing, not drawing.
vi.mock('@/features/admin/dashboard/components/sales-chart', () => ({ SalesChart: () => null }));
vi.mock('@/features/admin/dashboard/api', () => ({
  fetchSalesSummary: () => new Promise(() => undefined),
  fetchSalesByDay: () => new Promise(() => undefined),
  fetchSalesReport: () => new Promise(() => undefined),
}));
vi.mock('@/features/admin/orders/api', () => ({
  fetchAdminOrders: () => new Promise(() => undefined),
  fetchAdminOrder: () => new Promise(() => undefined),
}));
vi.mock('@/features/cart/api', () => ({
  fetchCart: () =>
    Promise.resolve({ items: [], totalQuantity: 0, subtotal: '0.00', hasIssues: false }),
}));

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

    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
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
  it.each([
    '/admin',
    '/admin/products',
    '/admin/products/new',
    '/admin/products/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f/edit',
    '/admin/categories',
    '/admin/orders',
    '/admin/orders/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f',
  ])('keeps a customer out of %s', async (path) => {
    const { router } = renderApp(path, CUSTOMER);

    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows the admin sections to an administrator', async () => {
    renderApp('/admin/orders', ADMIN);

    const sections = await screen.findByRole('navigation', { name: 'Admin sections' });

    expect(
      within(sections)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Dashboard', 'Products', 'Categories', 'Orders']);
  });

  it('lets an administrator into the lazy-loaded admin area', async () => {
    renderApp('/admin', ADMIN);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('keeps an administrator out of the customer pages', async () => {
    const { router } = renderApp('/cart', ADMIN);

    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it.each(['/checkout', '/orders', '/orders/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f'])(
    'keeps an administrator out of %s',
    async (path) => {
      const { router } = renderApp(path, ADMIN);

      expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
    },
  );

  it.each(['/checkout', '/orders', '/orders/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f'])(
    'sends an anonymous visitor from %s to the login and back',
    async (path) => {
      const { router } = renderApp(path);

      expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
      expect(router.state.location.search).toBe(`?returnTo=${encodeURIComponent(path)}`);
    },
  );

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
