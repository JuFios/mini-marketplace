import { NavLink, Outlet } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { SiteHeader } from './site-header';

const SECTIONS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products', end: false },
  { to: '/admin/categories', label: 'Categories', end: false },
  { to: '/admin/orders', label: 'Orders', end: false },
] as const;

/** Shell of the admin area. Loaded on demand (see the router), so customers never download it. */
export function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <nav aria-label="Admin sections" className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4">
          {SECTIONS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap',
                  isActive
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
