import { http } from '@/shared/api/client';
import type { AdminProduct, Paginated, StockAdjustmentResult } from '@/shared/api/types';
import type { CreateProductInput, UpdateProductInput } from './payload';
import { toApiParams, type AdminProductFilters } from './filters';

export async function fetchAdminProducts(
  filters: AdminProductFilters,
  signal?: AbortSignal,
): Promise<Paginated<AdminProduct>> {
  const { data } = await http.get<Paginated<AdminProduct>>('/admin/products', {
    params: toApiParams(filters),
    signal,
  });
  return data;
}

export async function fetchAdminProduct(id: string, signal?: AbortSignal): Promise<AdminProduct> {
  const { data } = await http.get<AdminProduct>(`/admin/products/${encodeURIComponent(id)}`, {
    signal,
  });
  return data;
}

export async function createProduct(input: CreateProductInput): Promise<AdminProduct> {
  const { data } = await http.post<AdminProduct>('/admin/products', input);
  return data;
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<AdminProduct> {
  const { data } = await http.patch<AdminProduct>(
    `/admin/products/${encodeURIComponent(id)}`,
    input,
  );
  return data;
}

/** Adds `delta` (negative removes) to the stock, so a concurrent sale is never overwritten. */
export async function adjustStock(
  id: string,
  delta: number,
  reason?: string,
): Promise<StockAdjustmentResult> {
  const { data } = await http.post<StockAdjustmentResult>(
    `/admin/products/${encodeURIComponent(id)}/stock-adjustments`,
    { delta, ...(reason && { reason }) },
  );
  return data;
}

export async function archiveProduct(id: string): Promise<void> {
  await http.delete(`/admin/products/${encodeURIComponent(id)}`);
}

export async function restoreProduct(id: string): Promise<AdminProduct> {
  const { data } = await http.post<AdminProduct>(
    `/admin/products/${encodeURIComponent(id)}/restore`,
  );
  return data;
}

/** Uploads a picture and returns the `/uploads/…` path to store as the product's `imageUrl`. */
export async function uploadProductImage(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const { data } = await http.post<{ url: string }>('/admin/products/images', body);
  return data.url;
}
