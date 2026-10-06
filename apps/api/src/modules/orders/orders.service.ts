import { Injectable } from '@nestjs/common';
import { ResourceNotFoundException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { OrderResponse } from './dto/order.response.dto';
import { toOrderResponse } from './mappers/to-order-response';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  /**
   * One of the customer's own orders. Another customer's order is reported exactly like a
   * missing one, so ids cannot be probed for existence.
   */
  async getOwn(userId: string, orderId: string): Promise<OrderResponse> {
    const order = await this.orders.findOwn(userId, orderId);
    if (!order) throw new ResourceNotFoundException('Order not found', ErrorCode.ORDER_NOT_FOUND);
    return toOrderResponse(order);
  }
}
