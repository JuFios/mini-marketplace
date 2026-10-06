import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  hasActiveFilters,
  isPriceRangeOrdered,
  isPriceValid,
  parseFilters,
  toApiParams,
  toSearchParams,
} from './filters';

const CATEGORY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const parse = (query: string) => parseFilters(new URLSearchParams(query));

describe('parseFilters', () => {
  it('reads every filter', () => {
    expect(
      parse(`q=mouse&category=${CATEGORY}&minPrice=5&maxPrice=20.50&sort=price_desc&page=3`),
    ).toEqual({
      search: 'mouse',
      categoryId: CATEGORY,
      minPrice: '5',
      maxPrice: '20.50',
      sort: 'price_desc',
      page: 3,
    });
  });

  it('uses the defaults for an empty query', () => {
    expect(parse('')).toEqual(DEFAULT_FILTERS);
  });

  it.each([
    ['a page below 1', 'page=0', { page: 1 }],
    ['a fractional page', 'page=1.5', { page: 1 }],
    ['a page that is not a number', 'page=abc', { page: 1 }],
    ['an unknown sort', 'sort=cheapest', { sort: 'newest' }],
    ['a category that is not an id', 'category=1%27%20OR%201%3D1', { categoryId: '' }],
    ['a price with three decimals', 'minPrice=1.999', { minPrice: '' }],
    ['a negative price', 'maxPrice=-5', { maxPrice: '' }],
    ['a price above the limit', 'maxPrice=1000000.01', { maxPrice: '' }],
    ['an inverted range', 'minPrice=50&maxPrice=10', { minPrice: '50', maxPrice: '' }],
  ])('drops %s', (_label, query, expected) => {
    expect(parse(query)).toMatchObject(expected);
  });

  it('trims and caps the search text', () => {
    expect(parse('q=%20%20mouse%20%20').search).toBe('mouse');
    expect(parse(`q=${'x'.repeat(150)}`).search).toHaveLength(100);
  });
});

describe('toSearchParams', () => {
  it('leaves defaults out', () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('writes what differs, and round-trips', () => {
    const filters = {
      search: 'wireless mouse',
      categoryId: CATEGORY,
      minPrice: '5',
      maxPrice: '20.50',
      sort: 'price_asc' as const,
      page: 2,
    };

    expect(parseFilters(toSearchParams(filters))).toEqual(filters);
  });
});

describe('toApiParams', () => {
  it('leaves empty filters undefined so they are not sent', () => {
    expect(toApiParams({ ...DEFAULT_FILTERS, search: 'mouse', page: 2 })).toEqual({
      page: 2,
      limit: 12,
      sort: 'newest',
      search: 'mouse',
      categoryId: undefined,
      minPrice: undefined,
      maxPrice: undefined,
    });
  });
});

describe('price checks', () => {
  it.each(['0', '5', '5.5', '19.99', '1000000.00', '1000000'])('accepts %s', (value) => {
    expect(isPriceValid(value)).toBe(true);
  });

  it.each(['', '-1', '1.', '.5', '1,5', '1.234', 'abc', '1000000.01', '12345678'])(
    'rejects "%s"',
    (value) => {
      expect(isPriceValid(value)).toBe(false);
    },
  );

  it('orders a range, with either bound optional', () => {
    expect(isPriceRangeOrdered('5', '5')).toBe(true);
    expect(isPriceRangeOrdered('5', '')).toBe(true);
    expect(isPriceRangeOrdered('', '5')).toBe(true);
    expect(isPriceRangeOrdered('10', '9.99')).toBe(false);
  });
});

describe('hasActiveFilters', () => {
  it('ignores the sort order and the page', () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: 'price_asc', page: 4 })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, minPrice: '5' })).toBe(true);
  });
});
