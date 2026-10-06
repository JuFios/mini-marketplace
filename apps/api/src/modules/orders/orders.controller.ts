import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { API_PREFIX } from '../../common/api-prefix';
import { Paginated } from '../../common/pagination/pagination.dto';
import { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { OrderResponse, OrderSummaryResponse } from './dto/order.response.dto';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  IdempotencyKey,
} from './idempotency-key.decorator';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersService } from './orders.service';

// Administrators do not shop: the whole controller is for customers.
@ApiTags('orders')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Place an order from the cart; a retry with the same key is safe' })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description:
      'New random value per checkout attempt (8-64 of A-Z a-z 0-9 _ -); resend it to retry',
  })
  @ApiCreatedResponse({ type: OrderResponse, description: 'Order placed (`Location` header)' })
  @ApiOkResponse({
    type: OrderResponse,
    description: 'The key was used before: the existing order, nothing new is created',
    headers: { [IDEMPOTENT_REPLAYED_HEADER]: { schema: { type: 'string', enum: ['true'] } } },
  })
  async place(
    @CurrentUser() user: AuthenticatedUser,
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CheckoutDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderResponse> {
    const { order, replayed } = await this.checkout.placeOrder({
      userId: user.id,
      idempotencyKey,
      shippingAddress: dto.shippingAddress,
    });
    if (replayed) {
      response.status(HttpStatus.OK).setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
    } else {
      response.status(HttpStatus.CREATED).location(`/${API_PREFIX}/orders/${order.id}`);
    }
    return order;
  }

  @Get()
  @ApiOperation({ summary: 'Your orders, newest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrderQueryDto,
  ): Promise<Paginated<OrderSummaryResponse>> {
    return this.orders.listOwn(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of your orders; 404 for any other' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    return this.orders.getOwn(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel one of your orders while it is NEW or PROCESSING; the stock is put back',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    return this.lifecycle.cancelOwn(user.id, id);
  }
}
