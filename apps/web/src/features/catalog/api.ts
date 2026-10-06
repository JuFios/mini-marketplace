import { http } from '@/shared/api/client';
import type { Category, Paginated, Product } from '@/shared/api/types';
import { toApiParams, type CatalogFilters } from './filters';

export async function fetchProducts(
  filters: CatalogFilters,
  signal?: AbortSignal,
): Promise<Paginated<Product>> {
  const { data } = await http.get<Paginated<Product>>('/products', {
    params: toApiParams(filters),
    signal,
  });
  return data;
}

export async function fetchProduct(id: string, signal?: AbortSignal): Promise<Product> {
  const { data } = await http.get<Product>(`/products/${encodeURIComponent(id)}`, { signal });
  return data;
}

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  const { data } = await http.get<Category[]>('/categories', { signal });
  return data;
}
