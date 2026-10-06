import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/pagination.dto';
import { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { AdminOrderQueryDto } from './dto/order-query.dto';
import { AdminOrderResponse, AdminOrderSummaryResponse } from './dto/order.response.dto';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersService } from './orders.service';

@ApiTags('admin-orders')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'All orders, newest first; filter by status, UTC days and customer' })
  list(@Query() query: AdminOrderQueryDto): Promise<Paginated<AdminOrderSummaryResponse>> {
    return this.orders.listAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Any order, with its customer' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminOrderResponse> {
    return this.orders.getForAdmin(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Ship, complete or cancel an order; a cancellation puts the stock back',
    description:
      'PROCESSING is set by payment processing only. A change the order cannot take from its ' +
      'current status, or one that lost a race with another change, is 409 INVALID_ORDER_TRANSITION.',
  })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeOrderStatusDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<AdminOrderResponse> {
    return this.lifecycle.changeStatus(id, dto.status, admin.id);
  }
}
