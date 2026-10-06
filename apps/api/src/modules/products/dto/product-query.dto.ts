import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { IsPriceFilter } from '../../../common/validators/is-price-filter.decorator';
import { Prisma } from '../../../generated/prisma/client';
import { trim } from './create-product.dto';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

// Query strings are text: "false" must not turn into a truthy string.
const toBoolean = ({ value }: TransformFnParams): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** The upper price bound may not be below the lower one. */
function IsNotBelowMinPrice(): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isNotBelowMinPrice',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: { message: 'maxPrice must not be less than minPrice' },
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const { minPrice } = args.object as { minPrice?: unknown };
          if (typeof value !== 'string' || typeof minPrice !== 'string') return true;
          // A malformed bound is reported by its own validator.
          if (!/^\d+(\.\d+)?$/.test(value) || !/^\d+(\.\d+)?$/.test(minPrice)) return true;
          return new Prisma.Decimal(value).gte(minPrice);
        },
      },
    });
}

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsPriceFilter()
  minPrice?: string;

  @IsOptional()
  @IsPriceFilter()
  @IsNotBelowMinPrice()
  maxPrice?: string;

  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'newest';

  /** `true` keeps only products with stock; `false` (or absent) applies no stock filter. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  inStock?: boolean;
}
