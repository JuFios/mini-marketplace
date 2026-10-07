import { describe, expect, it } from 'vitest';
import { MAX_PAGE, parsePage } from './page';

const parse = (query: string) => parsePage(new URLSearchParams(query));

describe('parsePage', () => {
  it('reads a page number', () => {
    expect(parse('page=3')).toBe(3);
  });

  it.each([
    ['no page', ''],
    ['an empty page', 'page='],
    ['a page below 1', 'page=0'],
    ['a negative page', 'page=-2'],
    ['a fractional page', 'page=1.5'],
    ['a page that is not a number', 'page=abc'],
    ['an infinite page', 'page=Infinity'],
  ])('means the first page for %s', (_label, query) => {
    expect(parse(query)).toBe(1);
  });

  it('clamps a page past what the API accepts', () => {
    expect(parse('page=99999999')).toBe(MAX_PAGE);
    expect(parse('page=1e20')).toBe(MAX_PAGE);
    expect(parse(`page=${MAX_PAGE}`)).toBe(MAX_PAGE);
  });
});
