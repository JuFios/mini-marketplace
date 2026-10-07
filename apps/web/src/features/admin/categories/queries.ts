import { useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogKeys } from '@/features/catalog/queries';
import { adminKeys } from '../keys';
import { createCategory, deleteCategory, renameCategory } from './api';

/** A category change also changes the names and counts shown with products, in the shop and here. */
function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: catalogKeys.categories });
    void queryClient.invalidateQueries({ queryKey: catalogKeys.products });
    void queryClient.invalidateQueries({ queryKey: adminKeys.products });
  };
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: invalidate,
  });
}

export function useRenameCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCategory(id, name),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: invalidate,
  });
}
