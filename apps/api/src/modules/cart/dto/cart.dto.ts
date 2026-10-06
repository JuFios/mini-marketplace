import { IsInt, IsUUID, Max, Min } from 'class-validator';

export const MAX_LINE_QUANTITY = 99;
export const MAX_CART_LINES = 50;

export class AddCartItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity!: number;
}

export class SetCartItemQuantityDto {
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity!: number;
}
