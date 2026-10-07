import { describe, expect, it } from 'vitest';
import { parseFilters, toApiParams, toSearchParams } from './filters';

const parse = (query: string) => parseFilters(new URLSearchParams(query));

describe('parseFilters', () => {
  it('reads a status and a page', () => {
    expect(parse('status=SHIPPED&page=3')).toEqual({ status: 'SHIPPED', page: 3 });
  });

  it('falls back to the defaults for an empty URL', () => {
    expect(parse('')).toEqual({ status: '', page: 1 });
  });

  it('drops what the API would reject', () => {
    expect(parse('status=PENDING&page=0')).toEqual({ status: '', page: 1 });
    expect(parse('status=shipped&page=-2')).toEqual({ status: '', page: 1 });
    expect(parse('page=2.5')).toEqual({ status: '', page: 1 });
    expect(parse('page=abc')).toEqual({ status: '', page: 1 });
  });

  it('caps an absurd page number', () => {
    expect(parse('page=99999999').page).toBe(100_000);
  });
});

describe('toSearchParams', () => {
  it('leaves defaults out of the URL', () => {
    expect(toSearchParams({ status: '', page: 1 }).toString()).toBe('');
    expect(toSearchParams({ status: 'NEW', page: 2 }).toString()).toBe('status=NEW&page=2');
  });
});

describe('toApiParams', () => {
  it('asks for a page of ten and leaves an empty status out', () => {
    expect(toApiParams({ status: '', page: 2 })).toEqual({
      page: 2,
      limit: 10,
      status: undefined,
    });
    expect(toApiParams({ status: 'CANCELLED', page: 1 })).toMatchObject({ status: 'CANCELLED' });
  });
});
