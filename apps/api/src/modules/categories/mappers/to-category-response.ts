import type { Category } from '../../../generated/prisma/client';
import type { CategoryResponse } from '../dto/category.response.dto';

export type CategoryWithCount = Category & { _count: { products: number } };

export function toCategoryResponse(category: CategoryWithCount): CategoryResponse {
  return { id: category.id, name: category.name, productCount: category._count.products };
}
