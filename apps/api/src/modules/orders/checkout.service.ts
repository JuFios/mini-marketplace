import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  AppException,
  IdempotencyKeyReusedException,
  InsufficientStockException,
  ResourceConflictException,
} from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { isUniqueViolation } from '../../common/filters/database-error';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { CatalogCacheService } from '../catalog-cache/catalog-cache.service';
import type { OrderResponse } from './dto/order.response.dto';
import { InventoryRepository, StockLine } from './inventory.repository';
import { inLockOrder } from './lock-order';
import { OrderWithItems, toOrderResponse } from './mappers/to-order-response';
import { ORDER_EVENTS_PUBLISHER } from './order-events.publisher';
import type { OrderEventsPublisher } from './order-events.publisher';
import { NewOrderItem, OrdersRepository } from './orders.repository';

export interface CheckoutRequest {
  userId: string;
  idempotencyKey: string;
  shippingAddress: string;
}

export interface CheckoutResult {
  order: OrderResponse;
  /** The key had been used already: this is the existing order, nothing new was created. */
  replayed: boolean;
}

interface TransactionOutcome {
  order: OrderWithItems;
  created: boolean;
}

/**
 * Turns a customer's cart into an order in one transaction: either the order exists, the stock is
 * taken and the purchased cart lines are gone, or nothing changed at all. It never sells more
 * units than there are and never creates two orders for one Idempotency-Key, for any interleaving
 * of concurrent requests; the comments on each step say which guarantee they rely on.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly inventory: InventoryRepository,
    private readonly orders: OrdersRepository,
    private readonly catalogCache: CatalogCacheService,
    @Inject(ORDER_EVENTS_PUBLISHER) private readonly orderEvents: OrderEventsPublisher,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(CheckoutService.name);
  }

  async placeOrder(request: CheckoutRequest): Promise<CheckoutResult> {
    const { userId, idempotencyKey } = request;

    // A retry of a checkout that already went through is answered without a transaction or locks.
    const previous = await this.orders.findByIdempotencyKey(userId, idempotencyKey);
    if (previous) return replay(previous, request);

    let outcome: TransactionOutcome;
    try {
      outcome = await this.prisma.$transaction((tx) => this.checkout(request, tx), {
        // Stated explicitly because the stock decrement relies on how READ COMMITTED re-checks a
        // row that a concurrent transaction changed (see InventoryRepository.decrementStock).
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    } catch (error) {
      // The unique index on (user_id, idempotency_key) is the final guard: a request with the
      // same key got its order in first, so this one is a replay of it.
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.orders.findByIdempotencyKey(userId, idempotencyKey);
      if (!winner) throw error;
      return replay(winner, request);
    }

    if (!outcome.created) return replay(outcome.order, request);
    await this.afterCommit(outcome.order);
    return { order: toOrderResponse(outcome.order, 'customer'), replayed: false };
  }

  private async checkout(
    { userId, idempotencyKey, shippingAddress }: CheckoutRequest,
    tx: Prisma.TransactionClient,
  ): Promise<TransactionOutcome> {
    // Locks the customer's cart rows until commit. Concurrent checkouts of the same customer (a
    // double click, two tabs) queue up here, and the later one then finds the purchased rows gone.
    const lines = inLockOrder(await this.cart.lockItemsForCheckout(userId, tx));

    // A request with the same key may have committed while this one waited for the locks; at
    // READ COMMITTED every statement sees what was committed before it started, so this read
    // finds that order. It comes before the empty-cart check because that order emptied the cart.
    const existing = await this.orders.findByIdempotencyKey(userId, idempotencyKey, tx);
    if (existing) return { order: existing, created: false };

    if (lines.length === 0) {
      throw new ResourceConflictException('Your cart is empty', ErrorCode.CART_EMPTY);
    }

    // Product rows are locked in ascending id order, the order every multi-row stock writer
    // uses, so concurrent checkouts with overlapping carts cannot deadlock. A line that cannot be
    // served aborts the transaction, which also rolls back the units taken for earlier lines.
    const items: NewOrderItem[] = [];
    let totalAmount = new Prisma.Decimal(0);
    for (const line of lines) {
      const product = await this.inventory.decrementStock(line.productId, line.quantity, tx);
      if (!product) throw await this.rejectLine(userId, line, tx);
      // Name and price snapshot from the row this transaction now holds locked.
      items.push({
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity: line.quantity,
      });
      totalAmount = totalAmount.add(product.price.mul(line.quantity));
    }

    const order = await this.orders.create(
      { userId, idempotencyKey, shippingAddress, totalAmount, items },
      tx,
    );
    // Only the rows locked above: a line added from another tab meanwhile stays in the cart.
    await this.cart.removePurchased(
      userId,
      lines.map((line) => line.productId),
      tx,
    );
    return { order, created: true };
  }

  /** The decrement only says "no row"; the product's current state tells the client why. */
  private async rejectLine(
    userId: string,
    line: StockLine,
    tx: Prisma.TransactionClient,
  ): Promise<AppException> {
    const product = await this.inventory.findStockState(line.productId, tx);
    const label = product ? `"${product.name}"` : 'A product in your cart';
    if (!product || product.deletedAt) {
      return new ResourceConflictException(
        `${label} is no longer available`,
        ErrorCode.PRODUCT_UNAVAILABLE,
        [{ productId: line.productId }],
      );
    }

    const shortage = {
      productId: line.productId,
      requested: line.quantity,
      available: product.stock,
    };
    this.logger.info(
      { event: 'checkout.insufficient_stock', userId, ...shortage },
      'Checkout refused: not enough stock',
    );
    return new InsufficientStockException(`Not enough stock for ${label}`, [shortage]);
  }

  /**
   * Side effects that may only happen once the order is committed. The order already exists, so
   * none of them is allowed to fail the request.
   */
  private async afterCommit(order: OrderWithItems): Promise<void> {
    // Stock changed. Fails open: if Redis is down, staleness is bounded by the cache TTL.
    await this.catalogCache.invalidate();
    try {
      await this.orderEvents.orderCreated(order.id);
    } catch (error) {
      this.logger.warn({ err: error, orderId: order.id }, 'Handing the order over failed');
    }
    this.logger.info(
      {
        event: 'order.created',
        orderId: order.id,
        userId: order.userId,
        totalAmount: order.totalAmount.toFixed(2),
        itemsCount: order.items.length,
      },
      'Order created',
    );
  }
}

/**
 * The key already produced `order`, so the answer is that order. A request that asks for something
 * else under the same key is a misuse, and answering with an order the caller did not ask for
 * would hide it: it is refused instead. The cart is no part of the comparison: it is server state,
 * which the first request has emptied since.
 */
function replay(order: OrderWithItems, request: CheckoutRequest): CheckoutResult {
  if (order.shippingAddress !== request.shippingAddress) throw new IdempotencyKeyReusedException();
  return { order: toOrderResponse(order, 'customer'), replayed: true };
}
