import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_FILTERS, parseFilters, toSearchParams, type CatalogFilters } from './filters';

/** The catalog filters, kept in the URL so a view can be shared, bookmarked and walked back to. */
export function useCatalogFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);

  const update = useCallback(
    (patch: Partial<CatalogFilters>, options: { push?: boolean } = {}) => {
      setParams(
        (current) =>
          // Any change of what is shown starts over from page 1 unless it names a page.
          toSearchParams({ ...parseFilters(current), page: 1, ...patch }),
        // Filters rewrite the URL in place; only paging is a step the back button should undo.
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
