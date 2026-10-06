import { IsEnum } from 'class-validator';
import { OrderStatus } from '../../../generated/prisma/client';

export class ChangeOrderStatusDto {
  /**
   * The status to move the order to. Any known status is accepted here; what an administrator
   * may actually do is decided by the order state machine (SHIPPED, COMPLETED or CANCELLED, from
   * the right status), and anything else is a 409 `INVALID_ORDER_TRANSITION`.
   */
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
