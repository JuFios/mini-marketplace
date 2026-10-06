import { Injectable } from '@nestjs/common';
import {
  CartLimitExceededException,
  InsufficientStockException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { Prisma } from '../../generated/prisma/client';
import { ProductsService } from '../products/products.service';
import { buildCartResponse } from './build-cart-response';
import { CartRepository, LockedCartItem } from './cart.repository';
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from './dto/cart.dto';
import type { CartResponse } from './dto/cart.response.dto';

/**
 * Per-customer cart. The checks here are soft, for friendly errors and the UI: they do not
 * reserve stock, and checkout re-validates everything under row locks. Every mutation returns the
 * whole updated cart, which is what lets a client reconcile an optimistic update in one step.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly cart: CartRepository,
    private readonly products: ProductsService,
  ) {}

  async get(userId: string): Promise<CartResponse> {
    return buildCartResponse(await this.cart.findLines(userId));
  }

  /** Adds to the existing quantity. */
  async addItem(userId: string, productId: string, quantity: number): Promise<CartResponse> {
    const existing = await this.cart.findQuantity(userId, productId);
    await this.assertAcceptable(userId, productId, (existing ?? 0) + quantity, existing === null);
    await this.cart.addQuantity(userId, productId, quantity);
    return this.get(userId);
  }

  /** Sets the quantity to an absolute value (creating the line if it is missing). */
  async setQuantity(userId: string, productId: string, quantity: number): Promise<CartResponse> {
    const existing = await this.cart.findQuantity(userId, productId);
    await this.assertAcceptable(userId, productId, quantity, existing === null);
    await this.cart.setQuantity(userId, productId, quantity);
    return this.get(userId);
  }

  /** Idempotent: removing a line that is not there is not an error. */
  async removeItem(userId: string, productId: string): Promise<CartResponse> {
    await this.cart.removeLine(userId, productId);
    return this.get(userId);
  }

  async clear(userId: string): Promise<CartResponse> {
    await this.cart.clear(userId);
    return this.get(userId);
  }

  /** For checkout: locks and returns the user's cart rows inside the caller's transaction. */
  lockItemsForCheckout(userId: string, tx: Prisma.TransactionClient): Promise<LockedCartItem[]> {
    return this.cart.lockForCheckout(userId, tx);
  }

  /** For checkout: removes exactly the purchased lines, inside the caller's transaction. */
  removePurchased(
    userId: string,
    productIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.cart.removeLines(userId, productIds, tx);
  }

  private async assertAcceptable(
    userId: string,
    productId: string,
    resultingQuantity: number,
    isNewLine: boolean,
  ): Promise<void> {
    const product = await this.products.getAvailability(productId);
    if (!product) {
      throw new ResourceNotFoundException('Product not found', ErrorCode.PRODUCT_NOT_FOUND);
    }
    if (product.isArchived) {
      throw new ResourceConflictException(
        'This product is no longer available',
        ErrorCode.PRODUCT_UNAVAILABLE,
      );
    }
    if (resultingQuantity > MAX_LINE_QUANTITY) {
      throw new CartLimitExceededException(
        `A line cannot hold more than ${MAX_LINE_QUANTITY} units`,
      );
    }
    if (resultingQuantity > product.stock) {
      throw new InsufficientStockException('Not enough stock for the requested quantity', [
        { productId, requested: resultingQuantity, available: product.stock },
      ]);
    }
    if (isNewLine && (await this.cart.countLines(userId)) >= MAX_CART_LINES) {
      throw new CartLimitExceededException(
        `A cart cannot hold more than ${MAX_CART_LINES} products`,
      );
    }
  }
}
