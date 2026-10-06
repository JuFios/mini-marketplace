import { Outlet, type RouteObject } from 'react-router';
import { CartPage } from '@/features/cart/pages/cart-page';
import { CatalogPage } from '@/features/catalog/pages/catalog-page';
import { LoginPage } from '@/features/auth/pages/login-page';
import { RegisterPage } from '@/features/auth/pages/register-page';
import { RequireGuest } from '@/features/auth/require-guest';
import { RequireRole } from '@/features/auth/require-role';
import { SplashScreen } from '@/shared/ui';
import { AccountLayout } from './layouts/account-layout';
import { PublicLayout } from './layouts/public-layout';
import { NotFoundPage } from './pages/not-found-page';
import { RouteErrorPage } from './pages/route-error-page';

export const routes: RouteObject[] = [
  {
    // Shown while the first route's code is still loading.
    HydrateFallback: SplashScreen,
    errorElement: <RouteErrorPage />,
    element: <Outlet />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <CatalogPage /> },
          {
            element: <RequireGuest />,
            children: [
              { path: 'login', element: <LoginPage /> },
              { path: 'register', element: <RegisterPage /> },
            ],
          },
          {
            element: <AccountLayout />,
            children: [{ path: 'cart', element: <CartPage /> }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        // The guard is outside the lazy route so that an anonymous visitor is redirected as soon
        // as the chunk arrives; the API enforces the role either way.
        element: <RequireRole role="ADMIN" />,
        children: [
          {
            path: 'admin',
            lazy: async () => ({
              Component: (await import('./layouts/admin-layout')).AdminLayout,
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('@/features/admin/dashboard/dashboard-page'))
                    .DashboardPage,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
];
