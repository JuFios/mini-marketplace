import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { InvalidOrderTransitionException } from '../../common/exceptions/app.exception';
import { OrderStatus, PaymentStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CatalogCacheService } from '../catalog-cache/catalog-cache.service';
import type { AdminOrderResponse, OrderResponse } from './dto/order.response.dto';
import { InventoryRepository } from './inventory.repository';
import { OrderWithItems, toAdminOrderResponse, toOrderResponse } from './mappers/to-order-response';
import { orderNotFound } from './order-not-found';
import { assertTransition, cancellationOutcome, OrderActor } from './order-state-machine';
import { OrdersRepository, StatusChange } from './orders.repository';

interface Actor {
  role: OrderActor;
  /** The user behind the change; the system acts on nobody's behalf. */
  id: string | null;
}

const SYSTEM: Actor = { role: 'system', id: null };

interface Transitioned<T> {
  from: OrderStatus;
  order: T;
}

/**
 * Moves orders through their lifecycle on behalf of a customer or an administrator: the state
 * machine decides what is allowed, a conditional update makes sure a change is applied once, and
 * a cancellation puts the stock back in the same transaction. The comments say which guarantee
 * each step relies on.
 */
@Injectable()
export class OrderLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersRepository,
    private readonly inventory: InventoryRepository,
    private readonly catalogCache: CatalogCacheService,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(OrderLifecycleService.name);
  }

  /** The customer cancels one of their own orders; any other order is "not found". */
  async cancelOwn(userId: string, orderId: string): Promise<OrderResponse> {
    const { order } = await this.transition(
      (tx) => this.orders.findOwn(userId, orderId, tx),
      OrderStatus.CANCELLED,
      { role: 'customer', id: userId },
    );
    return toOrderResponse(order, 'customer');
  }

  /** An administrator moves any order forward (shipped, completed) or cancels it. */
  async changeStatus(
    orderId: string,
    to: OrderStatus,
    adminId: string,
  ): Promise<AdminOrderResponse> {
    const { order } = await this.transition((tx) => this.orders.findWithCustomer(orderId, tx), to, {
      role: 'admin',
      id: adminId,
    });
    return toAdminOrderResponse(order);
  }

  /**
   * Payment processing: the charge succeeded, so the NEW order is paid and moves to PROCESSING.
   * Throws `INVALID_ORDER_TRANSITION` if the order is no longer NEW (e.g. it was cancelled while
   * the charge was in flight); the caller decides what that means.
   */
  async markPaid(orderId: string, paymentRef: string): Promise<void> {
    await this.transition(
      (tx) => this.orders.findById(orderId, tx),
      OrderStatus.PROCESSING,
      SYSTEM,
      { paymentStatus: PaymentStatus.PAID, paymentRef },
    );
  }

  /**
   * Payment processing: the charge was declined, so the NEW order is cancelled (payment FAILED,
   * reason PAYMENT_FAILED) and its stock goes back. Throws `INVALID_ORDER_TRANSITION` like
   * `markPaid`.
   */
  async cancelDeclined(orderId: string): Promise<void> {
    await this.transition((tx) => this.orders.findById(orderId, tx), OrderStatus.CANCELLED, SYSTEM);
  }

  /**
   * The customer cancelled while the charge was being made, and it went through: the order is
   * already CANCELLED (payment VOIDED, stock back), so what is left is to refund the money.
   * Returns whether this call did it.
   */
  async refundCancelled(orderId: string, paymentRef: string): Promise<boolean> {
    const refunded = await this.orders.markRefunded(orderId, paymentRef);
    if (refunded) {
      this.logger.info({ event: 'order.refunded', orderId, paymentRef }, 'Order payment refunded');
    }
    return refunded;
  }

  /**
   * One transaction: read the order, check the transition, change the status conditionally and,
   * for a cancellation, restock. `load` finds the order the caller may act on (it is also what
   * scopes a customer to their own orders) and is called again to read the result back.
   */
  private async transition<T extends OrderWithItems>(
    load: (tx: Prisma.TransactionClient) => Promise<T | null>,
    to: OrderStatus,
    actor: Actor,
    extra: Omit<StatusChange, 'status'> = {},
  ): Promise<Transitioned<T>> {
    const done = await this.prisma.$transaction(
      async (tx): Promise<Transitioned<T>> => {
        const before = found(await load(tx));
        assertTransition(before.status, to, actor.role);

        const change: StatusChange = {
          status: to,
          ...(to === OrderStatus.CANCELLED && cancellationOutcome(before.status, actor.role)),
          ...extra,
        };
        // Concurrency: the status check is part of the UPDATE (see OrdersRepository.changeStatus),
        // so of several requests racing on this order (a double click, the customer against an
        // administrator) only one gets past this point. The others find the status already
        // changed, and everything below runs for the winner alone: the restock happens once.
        if (!(await this.orders.changeStatus(before.id, before.status, change, tx))) {
          // Nothing has been written yet, so leaving the transaction here changes nothing.
          throw new InvalidOrderTransitionException(found(await load(tx)).status, to);
        }
        if (to === OrderStatus.CANCELLED) {
          // The lines of an order never change after checkout, so those read above are the
          // units to put back. Product rows are locked in the global lock order (restock sorts
          // them); the order row was locked first by the UPDATE, and checkout never locks an
          // existing order, so no two transactions can wait for each other in a cycle.
          await this.inventory.restock(before.items, tx);
        }
        return { from: before.status, order: found(await load(tx)) };
      },
      // Stated explicitly: the conditional UPDATE relies on how READ COMMITTED re-checks a row
      // that a concurrent transaction changed.
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    await this.afterCommit(done, actor);
    return done;
  }

  /** Side effects that must not happen if the transaction rolled back. None may fail the request. */
  private async afterCommit(
    { from, order }: Transitioned<OrderWithItems>,
    actor: Actor,
  ): Promise<void> {
    const cancelled = order.status === OrderStatus.CANCELLED;
    // Units went back on the shelf, which the cached catalog still shows as sold. Fails open: if
    // Redis is down, staleness is bounded by the cache TTL.
    if (cancelled) await this.catalogCache.invalidate();

    const orderId = order.id;
    this.logger.info(
      {
        event: 'order.status_changed',
        orderId,
        from,
        to: order.status,
        actor: actor.role,
        actorId: actor.id,
      },
      'Order status changed',
    );
    if (cancelled) {
      this.logger.info(
        {
          event: 'order.cancelled',
          orderId,
          actor: actor.role,
          actorId: actor.id,
          cancelReason: order.cancelReason,
          paymentStatus: order.paymentStatus,
          unitsRestocked: order.items.reduce((units, item) => units + item.quantity, 0),
        },
        'Order cancelled',
      );
    }
  }
}

function found<T>(order: T | null): T {
  if (!order) throw orderNotFound();
  return order;
}
