import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `page` and `limit` of every list endpoint; the cap on `limit` bounds the cost of a request. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
