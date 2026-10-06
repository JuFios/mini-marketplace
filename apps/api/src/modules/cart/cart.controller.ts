import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CartService } from './cart.service';
import { AddCartItemDto, SetCartItemQuantityDto } from './dto/cart.dto';
import { CartResponse } from './dto/cart.response.dto';

// Administrators do not shop: the whole controller is for customers.
@ApiTags('cart')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'The current cart, with availability flags' })
  get(@CurrentUser() user: AuthenticatedUser): Promise<CartResponse> {
    return this.cart.get(user.id);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add units of a product to the existing quantity' })
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddCartItemDto,
  ): Promise<CartResponse> {
    return this.cart.addItem(user.id, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Set the quantity of a product to an absolute value' })
  setQuantity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetCartItemQuantityDto,
  ): Promise<CartResponse> {
    return this.cart.setQuantity(user.id, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove a product from the cart (idempotent)' })
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<CartResponse> {
    return this.cart.removeItem(user.id, productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Empty the cart' })
  clear(@CurrentUser() user: AuthenticatedUser): Promise<CartResponse> {
    return this.cart.clear(user.id);
  }
}
