import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { IsImageUrl } from '../../../common/validators/is-image-url.decorator';
import { IsMoney } from '../../../common/validators/is-money.decorator';
import { trim } from '../../../common/validators/trim.transform';
import { MAX_PRICE } from './create-product.dto';

// Written out instead of derived with PartialType: that makes every field nullable, while only
// `imageUrl` may be cleared with null. `stock` is absent on purpose and rejected as unknown.
export class UpdateProductDto {
  @ValidateIf((_dto, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name?: string;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsString()
  @Length(0, 5000)
  description?: string;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsMoney(MAX_PRICE)
  price?: string;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsImageUrl()
  imageUrl?: string | null;
}
