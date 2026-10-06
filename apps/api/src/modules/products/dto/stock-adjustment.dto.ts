import { IsInt, IsOptional, IsString, Max, MaxLength, Min, NotEquals } from 'class-validator';
import { MAX_STOCK } from './create-product.dto';

export class StockAdjustmentDto {
  /** Units to add (positive) or remove (negative). */
  @IsInt()
  @Min(-MAX_STOCK)
  @Max(MAX_STOCK)
  @NotEquals(0)
  delta!: number;

  /** Free text for the audit log; not stored. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
