export type ProductStatusFilter = 'all' | 'active' | 'archived';

export const STATUS_OPTIONS: ReadonlyArray<{ value: ProductStatusFilter; label: string }> = [
  { value: 'all', label: 'All products' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export const ADMIN_PRODUCTS_PAGE_SIZE = 20;

export interface AdminProductFilters {
  search: string;
  categoryId: string;
  status: ProductStatusFilter;
  /** 1-based. */
  page: number;
}

export const DEFAULT_FILTERS: AdminProductFilters = {
  search: '',
  categoryId: '',
  status: 'all',
  page: 1,
};

const MAX_SEARCH_LENGTH = 100;
const MAX_PAGE = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isStatus(value: string | null): value is ProductStatusFilter {
  return STATUS_OPTIONS.some((option) => option.value === value);
}

/** Filters from a URL that anyone can edit by hand: what the API would reject is dropped. */
export function parseFilters(params: URLSearchParams): AdminProductFilters {
  const category = params.get('category') ?? '';
  const status = params.get('status');
  const page = Number(params.get('page'));
  return {
    search: (params.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH),
    categoryId: UUID.test(category) ? category : '',
    status: isStatus(status) ? status : DEFAULT_FILTERS.status,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The URL form of the filters; defaults are left out. */
export function toSearchParams(filters: AdminProductFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.categoryId) params.set('category', filters.categoryId);
  if (filters.status !== DEFAULT_FILTERS.status) params.set('status', filters.status);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/** The query of `GET /admin/products`; empty values are `undefined` so axios leaves them out. */
export function toApiParams(filters: AdminProductFilters) {
  return {
    page: filters.page,
    limit: ADMIN_PRODUCTS_PAGE_SIZE,
    status: filters.status,
    search: filters.search || undefined,
    categoryId: filters.categoryId || undefined,
  };
}

export function hasActiveFilters(filters: AdminProductFilters): boolean {
  return Boolean(filters.search || filters.categoryId || filters.status !== 'all');
}
