import type { ReactNode } from 'react';
import { getErrorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/errors';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { Spinner } from './spinner';

/** The part of a TanStack `useQuery` result the boundary needs, so a story can fake it in one line. */
export type BoundaryQuery<TData> = { refetch: () => unknown } & (
  { status: 'pending' } | { status: 'error'; error: unknown } | { status: 'success'; data: TData }
);

export interface QueryBoundaryProps<TData> {
  query: BoundaryQuery<TData>;
  /** Decides when `data` counts as "nothing to show" (an empty list, say). */
  isEmpty?: (data: TData) => boolean;
  /** Shown while the first load runs; a skeleton shaped like the content, if there is one. */
  loading?: ReactNode;
  empty?: ReactNode;
  children: (data: TData) => ReactNode;
}

/**
 * Gives every data view the same four outcomes: loading, error (with retry and the request id),
 * empty and content. Views write only the content.
 */
export function QueryBoundary<TData>({
  query,
  isEmpty,
  loading,
  empty,
  children,
}: QueryBoundaryProps<TData>) {
  if (query.status === 'pending') {
    return loading ?? <Spinner className="mx-auto my-12 text-brand-600" />;
  }

  if (query.status === 'error') {
    return (
      <ErrorState
        message={getErrorMessage(query.error)}
        requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (isEmpty?.(query.data)) {
    return empty ?? <EmptyState title="Nothing here yet" />;
  }
  return children(query.data);
}
