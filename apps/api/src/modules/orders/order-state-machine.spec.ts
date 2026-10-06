import { OrderStatus } from '../../generated/prisma/client';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  cancellationOutcome,
  OrderActor,
} from './order-state-machine';

const STATUSES = Object.values(OrderStatus);
const ACTORS: OrderActor[] = ['customer', 'admin', 'system'];

// The rules, written out by hand from the order lifecycle (not read back from the code under
// test): every other `from → to` pair, for every actor, must be refused.
const ALLOWED: [OrderStatus, OrderStatus, OrderActor][] = [
  ['NEW', 'PROCESSING', 'system'],
  ['NEW', 'CANCELLED', 'customer'],
  ['NEW', 'CANCELLED', 'admin'],
  ['NEW', 'CANCELLED', 'system'],
  ['PROCESSING', 'SHIPPED', 'admin'],
  ['PROCESSING', 'CANCELLED', 'customer'],
  ['PROCESSING', 'CANCELLED', 'admin'],
  ['SHIPPED', 'COMPLETED', 'admin'],
];

function thrownBy(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

const isAllowed = (from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean =>
  ALLOWED.some(([f, t, a]) => f === from && t === to && a === actor);

describe('order state machine', () => {
  describe('transition matrix', () => {
    const everyCombination = STATUSES.flatMap((from) =>
      STATUSES.flatMap((to) =>
        ACTORS.map((actor): [OrderStatus, OrderStatus, OrderActor] => [from, to, actor]),
      ),
    );

    it('covers every status, so a new status cannot slip past the matrix', () => {
      expect(STATUSES).toEqual(['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED']);
      expect(everyCombination).toHaveLength(5 * 5 * 3);
    });

    it.each(everyCombination)('%s → %s by %s', (from, to, actor) => {
      const allowed = isAllowed(from, to, actor);

      expect(canTransition(from, to, actor)).toBe(allowed);
      if (allowed) {
        expect(() => assertTransition(from, to, actor)).not.toThrow();
      } else {
        expect(thrownBy(() => assertTransition(from, to, actor))).toMatchObject({
          httpStatus: 409,
          code: 'INVALID_ORDER_TRANSITION',
          details: { currentStatus: from, requestedStatus: to },
        });
      }
    });
  });

  describe('allowedTransitions', () => {
    it.each<[OrderStatus, OrderActor, OrderStatus[]]>([
      ['NEW', 'customer', ['CANCELLED']],
      ['NEW', 'admin', ['CANCELLED']],
      ['NEW', 'system', ['PROCESSING', 'CANCELLED']],
      ['PROCESSING', 'customer', ['CANCELLED']],
      ['PROCESSING', 'admin', ['SHIPPED', 'CANCELLED']],
      ['PROCESSING', 'system', []],
      ['SHIPPED', 'customer', []],
      ['SHIPPED', 'admin', ['COMPLETED']],
      ['SHIPPED', 'system', []],
      ['COMPLETED', 'customer', []],
      ['COMPLETED', 'admin', []],
      ['CANCELLED', 'customer', []],
      ['CANCELLED', 'admin', []],
      ['CANCELLED', 'system', []],
    ])('%s order, as %s: %j', (status, actor, expected) => {
      expect(allowedTransitions({ status }, actor)).toEqual(expected);
    });

    it('lists exactly the moves canTransition accepts', () => {
      for (const from of STATUSES) {
        for (const actor of ACTORS) {
          const listed = allowedTransitions({ status: from }, actor);
          expect(listed).toEqual(STATUSES.filter((to) => canTransition(from, to, actor)));
        }
      }
    });
  });

  describe('cancellationOutcome', () => {
    it.each([
      ['NEW', 'customer', 'VOIDED', 'CUSTOMER_REQUEST'],
      ['NEW', 'admin', 'VOIDED', 'ADMIN_ACTION'],
      ['NEW', 'system', 'FAILED', 'PAYMENT_FAILED'],
      ['PROCESSING', 'customer', 'REFUNDED', 'CUSTOMER_REQUEST'],
      ['PROCESSING', 'admin', 'REFUNDED', 'ADMIN_ACTION'],
    ] as const)(
      'cancelling a %s order as %s leaves payment %s with reason %s',
      (from, actor, paymentStatus, cancelReason) => {
        expect(cancellationOutcome(from, actor)).toEqual({ paymentStatus, cancelReason });
      },
    );
  });
});
