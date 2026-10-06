import { describe, expect, it } from 'vitest';
import { getPageItems } from './pagination-items';

describe('getPageItems', () => {
  it.each([
    [1, 1, [1]],
    [1, 3, [1, 2, 3]],
    [1, 12, [1, 2, 'gap-after', 12]],
    [4, 12, [1, 2, 3, 4, 5, 'gap-after', 12]],
    [6, 12, [1, 'gap-before', 5, 6, 7, 'gap-after', 12]],
    [9, 12, [1, 'gap-before', 8, 9, 10, 11, 12]],
    [12, 12, [1, 'gap-before', 11, 12]],
  ])('page %i of %i', (page, totalPages, expected) => {
    expect(getPageItems(page, totalPages)).toEqual(expected);
  });
});
