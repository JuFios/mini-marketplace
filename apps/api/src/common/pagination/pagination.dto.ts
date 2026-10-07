import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/**
 * Far past any real list, and it keeps the offset (page × limit) a modest integer: `page=1e20`
 * passes as an integer, but its offset does not fit the 64 bits Prisma accepts and would fail as a
 * 500 instead of a 400. The SPA clamps page numbers from the URL to the same value.
 */
export const MAX_PAGE = 100_000;

/** `page` and `limit` of every list endpoint; the caps on both bound the cost of a request. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function paginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function pageOffset({ page, limit }: PaginationQueryDto): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
