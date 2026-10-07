import { http } from '@/shared/api/client';
import type { Category } from '@/shared/api/types';

// Reading the list is the public `GET /categories` (see `features/catalog`).

export async function createCategory(name: string): Promise<Category> {
  const { data } = await http.post<Category>('/admin/categories', { name });
  return data;
}

export async function renameCategory(id: string, name: string): Promise<Category> {
  const { data } = await http.patch<Category>(`/admin/categories/${encodeURIComponent(id)}`, {
    name,
  });
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await http.delete(`/admin/categories/${encodeURIComponent(id)}`);
}
