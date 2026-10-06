import { Prisma } from '../../generated/prisma/client';
import type { NormalizedProductListQuery } from '../catalog-cache/catalog-cache.keys';
import type { ProductQueryDto } from './dto/product-query.dto';

const price = (value: string | undefined): string | null =>
  value === undefined ? null : new Prisma.Decimal(value).toFixed(2);

/**
 * Reduces a validated query to its canonical form: defaults applied, text trimmed and lower-cased
 * (the search is case-insensitive anyway), prices in one notation. Requests that mean the same
 * thing therefore share one cache entry, and junk cannot multiply keys.
 */
export function normalizeProductListQuery(query: ProductQueryDto): NormalizedProductListQuery {
  return {
    page: query.page,
    limit: query.limit,
    search: query.search ? query.search.toLowerCase() : null,
    categoryId: query.categoryId?.toLowerCase() ?? null,
    minPrice: price(query.minPrice),
    maxPrice: price(query.maxPrice),
    sort: query.sort,
    inStock: query.inStock === true,
  };
}
