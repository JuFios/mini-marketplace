import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import {
  IsCalendarDate,
  IsNotBeforeDate,
} from '../../../common/validators/calendar-date.validators';
import { trim } from '../../../common/validators/trim.transform';
import { OrderStatus } from '../../../generated/prisma/client';

/** Query of `GET /orders`: the customer's own history. */
export class OrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

/** Query of `GET /admin/orders`. `from` and `to` are UTC days, both inclusive. */
export class AdminOrderQueryDto extends OrderQueryDto {
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  @IsNotBeforeDate('from')
  to?: string;

  /** Case-insensitive part of the customer's email address. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 254)
  customerEmail?: string;
}
