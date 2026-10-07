import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogKeys } from '@/features/catalog/queries';
import { getErrorMessage } from '@/shared/api/error-messages';
import { adminKeys } from '../keys';
import {
  adjustStock,
  archiveProduct,
  createProduct,
  fetchAdminProduct,
  fetchAdminProducts,
  restoreProduct,
  updateProduct,
  uploadProductImage,
} from './api';
import type { AdminProductFilters } from './filters';
import type { CreateProductInput, UpdateProductInput } from './payload';

export function useAdminProductsQuery(filters: AdminProductFilters) {
  return useQuery({
    queryKey: adminKeys.productList(filters),
    queryFn: ({ signal }) => fetchAdminProducts(filters, signal),
    // Keep showing the previous page while the next one loads instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });
}

export function useAdminProductQuery(id: string) {
  return useQuery({
    queryKey: adminKeys.product(id),
    queryFn: ({ signal }) => fetchAdminProduct(id, signal),
  });
}

/**
 * After any write: the admin lists, the public catalog (what shoppers see) and the categories
 * (their product counts) are all out of date.
 */
function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.products });
    void queryClient.invalidateQueries({ queryKey: catalogKeys.products });
    void queryClient.invalidateQueries({ queryKey: catalogKeys.categories });
  };
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(input),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct(id: string) {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (input: UpdateProductInput) => updateProduct(id, input),
    onSuccess: invalidate,
  });
}

export function useAdjustStock() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, delta, reason }: { id: string; delta: number; reason?: string }) =>
      adjustStock(id, delta, reason),
    onSuccess: invalidate,
  });
}

/** Archive and restore report through toasts: they are one-click actions on a table row. */
export function useArchiveProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (product: { id: string; name: string }) => archiveProduct(product.id),
    onSuccess: (_data, product) => {
      invalidate();
      toast.success(`Archived “${product.name}”`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useRestoreProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (product: { id: string; name: string }) => restoreProduct(product.id),
    onSuccess: (_data, product) => {
      invalidate();
      toast.success(`Restored “${product.name}”`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useUploadProductImage() {
  return useMutation({ mutationFn: (file: File) => uploadProductImage(file) });
}
