import { Injectable } from '@nestjs/common';
import { Paginated, pageOffset, paginated } from '../../common/pagination/pagination.dto';
import { createdAtRange } from '../../common/utils/utc-days';
import type { AdminOrderQueryDto, OrderQueryDto } from './dto/order-query.dto';
import type {
  AdminOrderResponse,
  AdminOrderSummaryResponse,
  OrderResponse,
  OrderSummaryResponse,
} from './dto/order.response.dto';
import {
  toAdminOrderResponse,
  toAdminOrderSummary,
  toOrderResponse,
  toOrderSummary,
} from './mappers/to-order-response';
import { orderNotFound } from './order-not-found';
import { OrdersRepository } from './orders.repository';

/** Reads of orders: the customer's own history and the administrators' view of all of them. */
@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  /** The customer's orders, newest first. */
  async listOwn(userId: string, query: OrderQueryDto): Promise<Paginated<OrderSummaryResponse>> {
    const { skip, take } = pageOffset(query);
    const { items, total } = await this.orders.findOwnPage(userId, query.status, skip, take);
    return paginated(items.map(toOrderSummary), total, query.page, query.limit);
  }

  /**
   * One of the customer's own orders. Another customer's order is reported exactly like a
   * missing one, so ids cannot be probed for existence.
   */
  async getOwn(userId: string, orderId: string): Promise<OrderResponse> {
    const order = await this.orders.findOwn(userId, orderId);
    if (!order) throw orderNotFound();
    return toOrderResponse(order, 'customer');
  }

  /** Every customer's orders, newest first. */
  async listAll(query: AdminOrderQueryDto): Promise<Paginated<AdminOrderSummaryResponse>> {
    const { skip, take } = pageOffset(query);
    const { items, total } = await this.orders.findPage(
      {
        status: query.status,
        createdAt: createdAtRange(query.from, query.to),
        customerEmail: query.customerEmail,
      },
      skip,
      take,
    );
    return paginated(items.map(toAdminOrderSummary), total, query.page, query.limit);
  }

  async getForAdmin(orderId: string): Promise<AdminOrderResponse> {
    const order = await this.orders.findWithCustomer(orderId);
    if (!order) throw orderNotFound();
    return toAdminOrderResponse(order);
  }
}
