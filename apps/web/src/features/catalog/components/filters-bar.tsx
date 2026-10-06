import { useEffect, useEffectEvent, useState } from 'react';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import type { Category } from '@/shared/api/types';
import { Button, FormField, Input, Select } from '@/shared/ui';
import {
  isPriceRangeOrdered,
  isPriceValid,
  SORT_OPTIONS,
  type CatalogFilters,
  type SortOption,
} from '../filters';

const DEBOUNCE_MS = 300;
const PRICE_HINT = 'Use a price like 19.99';

export interface FiltersBarProps {
  /** What the URL currently says. The text fields start from it and then run ahead of it (debounce). */
  filters: CatalogFilters;
  /** `undefined` while they load; the select then offers only "All categories". */
  categories: Category[] | undefined;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onReset: () => void;
  /** Whether the Reset button is worth showing. */
  isFiltered: boolean;
}

export function FiltersBar({
  filters,
  categories,
  onChange,
  onReset,
  isFiltered,
}: FiltersBarProps) {
  const [search, setSearch] = useState(filters.search);
  const [minPrice, setMinPrice] = useState(filters.minPrice);
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice);

  const debouncedSearch = useDebouncedValue(search.trim(), DEBOUNCE_MS);
  const debouncedMin = useDebouncedValue(minPrice.trim(), DEBOUNCE_MS);
  const debouncedMax = useDebouncedValue(maxPrice.trim(), DEBOUNCE_MS);

  // Effect events read the current URL values without making the effects below re-run (and push
  // a stale draft back into the URL) whenever the URL changes, e.g. after "Reset".
  const commitSearch = useEffectEvent((value: string) => {
    if (value !== filters.search) onChange({ search: value });
  });
  const commitPrices = useEffectEvent((min: string, max: string) => {
    const valid =
      (min === '' || isPriceValid(min)) &&
      (max === '' || isPriceValid(max)) &&
      isPriceRangeOrdered(min, max);
    // An invalid draft is shown with its error and simply not applied.
    if (valid && (min !== filters.minPrice || max !== filters.maxPrice)) {
      onChange({ minPrice: min, maxPrice: max });
    }
  });

  useEffect(() => commitSearch(debouncedSearch), [debouncedSearch]);
  useEffect(() => commitPrices(debouncedMin, debouncedMax), [debouncedMin, debouncedMax]);

  const min = minPrice.trim();
  const max = maxPrice.trim();
  const minError = min !== '' && !isPriceValid(min) ? PRICE_HINT : undefined;
  const maxError =
    max !== '' && !isPriceValid(max)
      ? PRICE_HINT
      : minError === undefined && !isPriceRangeOrdered(min, max)
        ? 'Must not be below the minimum'
        : undefined;

  function reset() {
    setSearch('');
    setMinPrice('');
    setMaxPrice('');
    onReset();
  }

  return (
    <form
      role="search"
      aria-label="Filter products"
      onSubmit={(event) => event.preventDefault()}
      className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <FormField label="Search" className="lg:col-span-2">
        {(control) => (
          <Input
            type="search"
            placeholder="Search products"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            {...control}
          />
        )}
      </FormField>
      <FormField label="Category">
        {(control) => (
          <Select
            value={filters.categoryId}
            onChange={(event) => onChange({ categoryId: event.target.value })}
            {...control}
          >
            <option value="">All categories</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField label="Min price" error={minError}>
        {(control) => (
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            {...control}
          />
        )}
      </FormField>
      <FormField label="Max price" error={maxError}>
        {(control) => (
          <Input
            inputMode="decimal"
            placeholder="Any"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            {...control}
          />
        )}
      </FormField>
      <FormField label="Sort by">
        {(control) => (
          <Select
            value={filters.sort}
            onChange={(event) => onChange({ sort: event.target.value as SortOption })}
            {...control}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {isFiltered && (
        <div className="sm:col-span-2 lg:col-span-6">
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset filters
          </Button>
        </div>
      )}
    </form>
  );
}
