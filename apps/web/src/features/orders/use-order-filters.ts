import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { parseFilters, toSearchParams, type OrderFilters } from './filters';

/** The order list's status and page, kept in the URL so a view can be shared and walked back to. */
export function useOrderFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);

  const update = useCallback(
    (patch: Partial<OrderFilters>, options: { push?: boolean } = {}) => {
      setParams(
        // A new status starts over from page 1 unless the change names a page.
        (current) => toSearchParams({ ...parseFilters(current), page: 1, ...patch }),
        // Only paging is a step the back button should undo.
        { replace: !options.push },
      );
    },
    [setParams],
  );

  return { filters, update };
}
