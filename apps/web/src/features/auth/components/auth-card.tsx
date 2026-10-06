import type { ReactNode } from 'react';

export interface AuthCardProps {
  title: string;
  children: ReactNode;
  /** A line under the form, usually a link to the other auth page. */
  footer?: ReactNode;
}

export function AuthCard({ title, children, footer }: AuthCardProps) {
  return (
    <div className="mx-auto w-full max-w-sm space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {children}
      {footer && <p className="text-center text-sm text-slate-600">{footer}</p>}
    </div>
  );
}
