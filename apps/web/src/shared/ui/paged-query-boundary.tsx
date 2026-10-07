import type { ReactNode } from 'react';
import type { PageMeta, Paginated } from '@/shared/api/types';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { QueryBoundary, type BoundaryQuery } from './query-boundary';

export interface PagedQueryBoundaryProps<TItem> {
  query: BoundaryQuery<Paginated<TItem>>;
  loading?: ReactNode;
  /** Shown when nothing matches at all. */
  empty?: ReactNode;
  /** Leaves a page past the end for the first page, keeping everything else. */
  onFirstPage: () => void;
  children: (data: Paginated<TItem>) => ReactNode;
}

/**
 * A `QueryBoundary` for one page of a list. A page with no items of a list that has some means
 * the URL points past the end (an old link, or items gone since), so the filters are not the
 * problem: it gets its own state with a way to the first page instead of the `empty` one.
 */
export function PagedQueryBoundary<TItem>({
  query,
  loading,
  empty,
  onFirstPage,
  children,
}: PagedQueryBoundaryProps<TItem>) {
  return (
    <QueryBoundary
      query={query}
      isEmpty={(data) => data.meta.total === 0}
      loading={loading}
      empty={empty}
    >
      {(data) =>
        data.items.length > 0 ? (
          children(data)
        ) : (
          <PastTheEnd meta={data.meta} onFirstPage={onFirstPage} />
        )
      }
    </QueryBoundary>
  );
}

function PastTheEnd({ meta, onFirstPage }: { meta: PageMeta; onFirstPage: () => void }) {
  return (
    <EmptyState
      title={`There is no page ${meta.page}`}
      description={
        meta.totalPages === 1
          ? 'This list has only one page.'
          : `This list has ${meta.totalPages} pages.`
      }
      action={
        <Button variant="secondary" onClick={onFirstPage}>
          Go to the first page
        </Button>
      }
    />
  );
}
