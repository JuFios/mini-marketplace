import { Outlet } from 'react-router';
import { SiteHeader } from './site-header';

/** Shell of the admin area. Loaded on demand (see the router), so customers never download it. */
export function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
