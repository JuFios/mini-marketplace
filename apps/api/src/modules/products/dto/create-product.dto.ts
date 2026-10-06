import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { IsImageUrl } from '../../../common/validators/is-image-url.decorator';
import { IsMoney } from '../../../common/validators/is-money.decorator';
import { trim } from '../../../common/validators/trim.transform';

export const MAX_PRICE = '1000000.00';
export const MAX_STOCK = 1_000_000;

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(0, 5000)
  description!: string;

  @IsMoney(MAX_PRICE)
  price!: string;

  @IsUUID()
  categoryId!: string;

  // Initial stock only: afterwards it changes through stock adjustments (deltas), so an edit
  // can never overwrite units sold in the meantime.
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  stock!: number;

  @IsOptional()
  @IsImageUrl()
  imageUrl?: string;
}
