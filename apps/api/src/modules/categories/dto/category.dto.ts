import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trim } from '../../../common/validators/trim.transform';

export class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class UpdateCategoryDto extends CreateCategoryDto {}
