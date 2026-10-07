import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_FILTERS, parseFilters, toSearchParams, type AdminOrderFilters } from './filters';

/** The admin order table's filters, kept in the URL so a view can be shared and walked back to. */
export function useAdminOrderFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);

  const update = useCallback(
    (patch: Partial<AdminOrderFilters>, options: { push?: boolean } = {}) => {
      setParams(
        // Any change of what is shown starts over from page 1 unless it names a page.
        (current) => toSearchParams({ ...parseFilters(current), page: 1, ...patch }),
        // Only paging is a step the back button should undo.
        { replace: !options.push },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => {
    setParams(toSearchParams(DEFAULT_FILTERS), { replace: true });
  }, [setParams]);

  return { filters, update, reset };
}
