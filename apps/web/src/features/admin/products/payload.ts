import type { AdminProduct } from '@/shared/api/types';
import type { ProductValues } from './schemas';

export interface CreateProductInput {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  stock: number;
  imageUrl?: string;
}

/** `stock` is absent: after creation it only changes through stock adjustments. */
export interface UpdateProductInput {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  /** `null` removes the picture. */
  imageUrl: string | null;
}

export function toCreateInput(values: ProductValues): CreateProductInput {
  return {
    name: values.name,
    description: values.description,
    price: values.price,
    categoryId: values.categoryId,
    stock: Number(values.stock),
    ...(values.imageUrl && { imageUrl: values.imageUrl }),
  };
}

export function toUpdateInput(values: ProductValues): UpdateProductInput {
  return {
    name: values.name,
    description: values.description,
    price: values.price,
    categoryId: values.categoryId,
    imageUrl: values.imageUrl || null,
  };
}

export function toFormValues(product: AdminProduct): ProductValues {
  return {
    name: product.name,
    description: product.description,
    price: product.price,
    categoryId: product.category.id,
    stock: String(product.stock),
    imageUrl: product.imageUrl ?? '',
  };
}
