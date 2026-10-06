import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trim } from '../../../common/validators/trim.transform';

export class CheckoutDto {
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  shippingAddress!: string;
}
