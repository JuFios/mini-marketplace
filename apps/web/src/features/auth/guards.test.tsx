import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@/shared/api/types';
import { ADMIN, CUSTOMER } from '@/test/fake-api';
import { AuthContext } from './auth-context';
import { RequireAuth } from './require-auth';
import { RequireGuest } from './require-guest';
import { RequireRole } from './require-role';

function Where() {
  const { pathname, search } = useLocation();
  return <p>at {pathname + search}</p>;
}

function renderAt(path: string, user: User | null) {
  const value = { user, login: vi.fn(), register: vi.fn(), logout: vi.fn() };
  return render(
    <AuthContext value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Where />} />
          <Route path="/login" element={<RequireGuest />}>
            <Route
              index
              element={
                <>
                  <p>login page</p>
                  <Where />
                </>
              }
            />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/orders" element={<p>orders page</p>} />
          </Route>
          <Route element={<RequireRole role="ADMIN" />}>
            <Route path="/admin" element={<p>admin page</p>} />
          </Route>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  );
}

describe('RequireRole', () => {
  it('sends a customer away from the admin area', () => {
    renderAt('/admin', CUSTOMER);

    expect(screen.queryByText('admin page')).not.toBeInTheDocument();
    expect(screen.getByText('at /')).toBeInTheDocument();
  });

  it('lets an administrator in', () => {
    renderAt('/admin', ADMIN);

    expect(screen.getByText('admin page')).toBeInTheDocument();
  });

  it('sends an anonymous visitor to the login page and remembers the target', () => {
    renderAt('/admin', null);

    expect(screen.getByText('at /login?returnTo=%2Fadmin')).toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  it('lets a logged-in person in', () => {
    renderAt('/orders', CUSTOMER);

    expect(screen.getByText('orders page')).toBeInTheDocument();
  });

  it('keeps the query string of the page that was asked for', () => {
    renderAt('/orders?status=NEW', null);

    expect(screen.getByText('at /login?returnTo=%2Forders%3Fstatus%3DNEW')).toBeInTheDocument();
  });
});

describe('RequireGuest', () => {
  it('shows the login page to an anonymous visitor', () => {
    renderAt('/login', null);

    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends a logged-in person to where they were headed', () => {
    renderAt('/login?returnTo=%2Forders', CUSTOMER);

    expect(screen.getByText('orders page')).toBeInTheDocument();
  });

  it('ignores a returnTo that points off-site', () => {
    renderAt('/login?returnTo=%2F%2Fevil.example', CUSTOMER);

    expect(screen.getByText('at /')).toBeInTheDocument();
  });
});
