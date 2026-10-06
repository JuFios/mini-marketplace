import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CheckoutDto {
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  shippingAddress!: string;
}
