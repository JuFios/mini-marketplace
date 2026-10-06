import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCategories, fetchProduct, fetchProducts } from './api';
import type { CatalogFilters } from './filters';

// Everything under `['products']` goes stale together (a checkout changes stock everywhere).
export const catalogKeys = {
  products: ['products'] as const,
  list: (filters: CatalogFilters) => ['products', 'list', filters] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
  categories: ['categories'] as const,
};

export function useProductsQuery(filters: CatalogFilters) {
  return useQuery({
    queryKey: catalogKeys.list(filters),
    queryFn: ({ signal }) => fetchProducts(filters, signal),
    // Keep showing the previous page while the next one loads instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  });
}

export function useProductQuery(id: string) {
  return useQuery({
    queryKey: catalogKeys.detail(id),
    queryFn: ({ signal }) => fetchProduct(id, signal),
  });
}

export function useCategoriesQuery() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: ({ signal }) => fetchCategories(signal),
    // Categories change rarely and the API caches them too.
    staleTime: 5 * 60_000,
  });
}
