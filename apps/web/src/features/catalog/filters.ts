import { toCents } from '@/shared/lib/money';

export type SortOption = 'newest' | 'price_asc' | 'price_desc';

export const SORT_OPTIONS: ReadonlyArray<{ value: SortOption; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export const PAGE_SIZE = 12;

export interface CatalogFilters {
  search: string;
  categoryId: string;
  minPrice: string;
  maxPrice: string;
  sort: SortOption;
  /** 1-based. */
  page: number;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  search: '',
  categoryId: '',
  minPrice: '',
  maxPrice: '',
  sort: 'newest',
  page: 1,
};

const MAX_SEARCH_LENGTH = 100;
const MAX_PRICE_CENTS = 1_000_000_00;
const MAX_PAGE = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE = /^\d{1,7}(\.\d{1,2})?$/;

/** What the API accepts for `minPrice` / `maxPrice`: up to two decimals, at most 1 000 000.00. */
export function isPriceValid(value: string): boolean {
  return PRICE.test(value) && toCents(value) <= MAX_PRICE_CENTS;
}

/** Both bounds are known to be valid here; empty means "no bound". */
export function isPriceRangeOrdered(min: string, max: string): boolean {
  return min === '' || max === '' || toCents(min) <= toCents(max);
}

function isSortOption(value: string | null): value is SortOption {
  return SORT_OPTIONS.some((option) => option.value === value);
}

/**
 * Filters from a URL that anyone can edit by hand. Whatever the API would reject (a malformed
 * id or price, an inverted range, a page below 1) is dropped here, so a bad link shows a
 * catalog rather than an error.
 */
export function parseFilters(params: URLSearchParams): CatalogFilters {
  const category = params.get('category') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  let maxPrice = params.get('maxPrice') ?? '';
  const sort = params.get('sort');
  const page = Number(params.get('page'));

  const validMin = isPriceValid(minPrice) ? minPrice : '';
  if (!isPriceValid(maxPrice) || !isPriceRangeOrdered(validMin, maxPrice)) maxPrice = '';

  return {
    search: (params.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH),
    categoryId: UUID.test(category) ? category : '',
    minPrice: validMin,
    maxPrice,
    sort: isSortOption(sort) ? sort : DEFAULT_FILTERS.sort,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The URL form of the filters; defaults are left out so the plain catalog has a plain URL. */
export function toSearchParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.categoryId) params.set('category', filters.categoryId);
  if (filters.minPrice) params.set('minPrice', filters.minPrice);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/** The query of `GET /products`; empty values are `undefined` so axios leaves them out. */
export function toApiParams(filters: CatalogFilters) {
  return {
    page: filters.page,
    limit: PAGE_SIZE,
    sort: filters.sort,
    search: filters.search || undefined,
    categoryId: filters.categoryId || undefined,
    minPrice: filters.minPrice || undefined,
    maxPrice: filters.maxPrice || undefined,
  };
}

/** Whether anything narrows the catalog (the page and the sort order do not). */
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.search || filters.categoryId || filters.minPrice || filters.maxPrice);
}
