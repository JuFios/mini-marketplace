import type { Category } from '@/shared/api/types';
import { useUrlDraft } from '@/shared/hooks/use-url-draft';
import { Button, FormField, Input, Select } from '@/shared/ui';
import { STATUS_OPTIONS, type AdminProductFilters, type ProductStatusFilter } from '../filters';

export interface ProductsFiltersProps {
  /** What the URL currently says; the search box starts from it and then runs ahead (debounce). */
  filters: AdminProductFilters;
  /** `undefined` while they load; the select then offers only "All categories". */
  categories: Category[] | undefined;
  onChange: (patch: Partial<AdminProductFilters>) => void;
  onReset: () => void;
  isFiltered: boolean;
}

export function ProductsFilters({
  filters,
  categories,
  onChange,
  onReset,
  isFiltered,
}: ProductsFiltersProps) {
  const [search, setSearch] = useUrlDraft(filters.search, (value) => onChange({ search: value }));

  function reset() {
    setSearch('');
    onReset();
  }

  return (
    <form
      role="search"
      aria-label="Filter products"
      onSubmit={(event) => event.preventDefault()}
      className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3"
    >
      <FormField label="Search">
        {(control) => (
          <Input
            type="search"
            placeholder="Search by name"
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
      <FormField label="Status">
        {(control) => (
          <Select
            value={filters.status}
            onChange={(event) => onChange({ status: event.target.value as ProductStatusFilter })}
            {...control}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {isFiltered && (
        <div className="sm:col-span-3">
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset filters
          </Button>
        </div>
      )}
    </form>
  );
}
