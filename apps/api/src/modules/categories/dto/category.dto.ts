import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class UpdateCategoryDto extends CreateCategoryDto {}
