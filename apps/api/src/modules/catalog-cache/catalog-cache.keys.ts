import { createHash } from 'node:crypto';

/** Canonical form of a product-list query: equivalent requests must produce an equal object. */
export interface NormalizedProductListQuery {
  page: number;
  limit: number;
  search: string | null;
  categoryId: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  sort: string;
  inStock: boolean;
}

/** Hash of the normalised query, with the properties in a fixed order. */
export function productListKeySuffix(query: NormalizedProductListQuery): string {
  const canonical = JSON.stringify([
    query.page,
    query.limit,
    query.search,
    query.categoryId,
    query.minPrice,
    query.maxPrice,
    query.sort,
    query.inStock,
  ]);
  return `products:list:${createHash('sha1').update(canonical).digest('hex')}`;
}

export const productKeySuffix = (id: string): string => `products:item:${id}`;
export const CATEGORIES_KEY_SUFFIX = 'categories';
