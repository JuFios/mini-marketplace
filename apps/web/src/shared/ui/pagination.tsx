import { cn } from '@/shared/lib/cn';
import { getPageItems } from './pagination-items';

export interface PaginationProps {
  /** 1-based. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const ITEM =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={cn(
          ITEM,
          'cursor-pointer text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        Previous
      </button>
      {getPageItems(page, totalPages).map((item) =>
        typeof item === 'string' ? (
          <span key={item} aria-hidden="true" className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={cn(
              ITEM,
              'cursor-pointer',
              item === page ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100',
            )}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(
          ITEM,
          'cursor-pointer text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        Next
      </button>
    </nav>
  );
}
