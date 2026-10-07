import { describe, expect, it } from 'vitest';
import { hasActiveFilters, parseFilters, toApiParams, toSearchParams } from './filters';

const parse = (query: string) => parseFilters(new URLSearchParams(query));
const CATEGORY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('parseFilters', () => {
  it('reads every filter', () => {
    expect(parse(`q=mouse&category=${CATEGORY}&status=archived&page=3`)).toEqual({
      search: 'mouse',
      categoryId: CATEGORY,
      status: 'archived',
      page: 3,
    });
  });

  it('defaults to all products on page 1', () => {
    expect(parse('')).toEqual({ search: '', categoryId: '', status: 'all', page: 1 });
  });

  it('drops what the API would reject', () => {
    expect(parse('category=nope&status=deleted&page=0')).toEqual({
      search: '',
      categoryId: '',
      status: 'all',
      page: 1,
    });
  });

  it('trims and caps the search', () => {
    expect(parse('q=%20%20mouse%20').search).toBe('mouse');
    expect(parse(`q=${'x'.repeat(150)}`).search).toHaveLength(100);
  });
});

describe('toSearchParams', () => {
  it('leaves defaults out of the URL', () => {
    expect(toSearchParams(parse('')).toString()).toBe('');
    expect(toSearchParams(parse('status=active&page=2&q=a')).toString()).toBe(
      'q=a&status=active&page=2',
    );
  });
});

describe('toApiParams', () => {
  it('asks for twenty per page and leaves empty filters out', () => {
    expect(toApiParams(parse('status=active'))).toEqual({
      page: 1,
      limit: 20,
      status: 'active',
      search: undefined,
      categoryId: undefined,
    });
  });
});

describe('hasActiveFilters', () => {
  it('counts the status, but not the page', () => {
    expect(hasActiveFilters(parse('page=4'))).toBe(false);
    expect(hasActiveFilters(parse('status=archived'))).toBe(true);
    expect(hasActiveFilters(parse('q=a'))).toBe(true);
  });
});
