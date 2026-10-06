import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { trim } from './create-product.dto';

export const PRODUCT_STATUSES = ['active', 'archived', 'all'] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUSES)[number];

export class AdminProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status: ProductStatusFilter = 'all';
}
