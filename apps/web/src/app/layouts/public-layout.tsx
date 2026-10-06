import { Outlet } from 'react-router';
import { SiteHeader } from './site-header';

/** The storefront shell: header, page, footer. Every non-admin route lives inside it. */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-sm text-slate-500">
        © Mini Marketplace
      </footer>
    </div>
  );
}
