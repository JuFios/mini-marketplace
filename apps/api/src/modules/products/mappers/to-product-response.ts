import type { Prisma } from '../../../generated/prisma/client';
import type { AdminProductResponse, ProductResponse } from '../dto/product.response.dto';

export type ProductWithCategory = Prisma.ProductGetPayload<{
  include: { category: { select: { id: true; name: true } } };
}>;

/** Explicit allow-list of fields; the entity also carries `deletedAt`, which customers must not see. */
export function toProductResponse(product: ProductWithCategory): ProductResponse {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price.toFixed(2),
    stock: product.stock,
    inStock: product.stock > 0,
    imageUrl: product.imageUrl,
    category: { id: product.category.id, name: product.category.name },
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function toAdminProductResponse(product: ProductWithCategory): AdminProductResponse {
  return { ...toProductResponse(product), deletedAt: product.deletedAt?.toISOString() ?? null };
}
