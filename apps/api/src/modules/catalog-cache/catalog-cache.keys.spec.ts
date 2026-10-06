import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { normalizeProductListQuery } from '../products/catalog-query';
import { ProductQueryDto } from '../products/dto/product-query.dto';
import { productListKeySuffix } from './catalog-cache.keys';

const keyOf = (query: Record<string, unknown>): string =>
  productListKeySuffix(normalizeProductListQuery(plainToInstance(ProductQueryDto, query)));

const CATEGORY = '3f2b1c1e-7c1a-4b0e-9a54-0d1c5f0a7b11';

describe('product list cache key', () => {
  it('is identical for queries that mean the same thing', () => {
    const canonical = keyOf({});

    expect(keyOf({ page: '1', limit: '20', sort: 'newest' })).toBe(canonical);
    expect(keyOf({ inStock: 'false' })).toBe(canonical);
    expect(keyOf({ search: '  Mouse ' })).toBe(keyOf({ search: 'mouse' }));
    expect(keyOf({ search: 'MOUSE' })).toBe(keyOf({ search: 'mouse' }));
    expect(keyOf({ minPrice: '10', maxPrice: '20.5' })).toBe(
      keyOf({ minPrice: '10.00', maxPrice: '20.50' }),
    );
    expect(keyOf({ categoryId: CATEGORY.toUpperCase() })).toBe(keyOf({ categoryId: CATEGORY }));
  });

  it('does not depend on the order of the query parameters', () => {
    const a = keyOf({ search: 'x', minPrice: '1', sort: 'price_asc' });
    const b = keyOf({ sort: 'price_asc', minPrice: '1', search: 'x' });

    expect(a).toBe(b);
  });

  it.each([
    ['another page', { page: '2' }],
    ['another page size', { limit: '50' }],
    ['a search term', { search: 'mouse' }],
    ['a category', { categoryId: CATEGORY }],
    ['a lower price bound', { minPrice: '5' }],
    ['an upper price bound', { maxPrice: '5' }],
    ['another sort', { sort: 'price_desc' }],
    ['the in-stock filter', { inStock: 'true' }],
  ])('differs for %s', (_label, query) => {
    expect(keyOf(query)).not.toBe(keyOf({}));
  });

  it('is a fixed-size hash, so search text cannot inflate or inject into the key', () => {
    expect(keyOf({ search: 'x'.repeat(100) })).toMatch(/^products:list:[0-9a-f]{40}$/);
  });

  it('distinguishes a missing bound from an explicit zero', () => {
    expect(keyOf({ minPrice: '0' })).not.toBe(keyOf({}));
  });
});
