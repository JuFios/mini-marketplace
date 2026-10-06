import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Usually a Button or a Link that gets the person out of the dead end. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center',
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
