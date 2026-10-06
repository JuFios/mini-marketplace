import { createHash } from 'node:crypto';
import {
  CancelReason,
  OrderStatus,
  PaymentStatus,
  Prisma,
  type PrismaClient,
} from '../src/generated/prisma/client';

export const HISTORY_DAYS = 30;
const MAX_ORDERS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedProductRef {
  id: string;
  name: string;
  price: string;
}

/** Small deterministic PRNG (mulberry32), seeded from text: the same day always gives the same orders. */
function randomFor(text: string): () => number {
  let state = createHash('sha1').update(text).digest().readUInt32BE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Recent orders are still on their way; older ones have mostly been delivered. */
function pickStatus(ageDays: number, roll: number): OrderStatus {
  if (ageDays >= 5) return roll < 0.75 ? OrderStatus.COMPLETED : OrderStatus.CANCELLED;
  if (roll < 0.3) return OrderStatus.COMPLETED;
  if (roll < 0.55) return OrderStatus.SHIPPED;
  if (roll < 0.8) return OrderStatus.PROCESSING;
  return OrderStatus.CANCELLED;
}

/**
 * Adds paid and cancelled orders spread over the last 30 days (UTC), so the dashboard and the CSV
 * export have something to show on the first run. Idempotent: an order's id comes from its day and
 * position, so a rerun adds nothing, and a later day only adds the days that are new. It is
 * history only: product stock is deliberately left as seeded.
 */
export async function seedDemoOrders(
  prisma: PrismaClient,
  customerId: string,
  products: readonly SeedProductRef[],
  seedId: (name: string) => string,
  now: Date = new Date(),
): Promise<number> {
  let created = 0;

  for (let ageDays = 0; ageDays < HISTORY_DAYS; ageDays += 1) {
    const dayStart = new Date(now.getTime() - ageDays * DAY_MS);
    dayStart.setUTCHours(0, 0, 0, 0);
    const day = dayStart.toISOString().slice(0, 10);
    const random = randomFor(`orders:${day}`);
    const orderCount = 1 + Math.floor(random() * MAX_ORDERS_PER_DAY);

    for (let index = 0; index < orderCount; index += 1) {
      // Every random draw below happens whether or not the order exists, so skipping one never
      // changes the others.
      const id = seedId(`order:${day}:${index}`);
      const requested = dayStart.getTime() + Math.floor(random() * DAY_MS);
      // Today's orders must not lie in the future.
      const createdAt = new Date(Math.min(requested, now.getTime() - 60_000));
      const status = pickStatus(ageDays, random());
      const refunded = random() < 0.5;
      const lineCount = 1 + Math.floor(random() * 3);
      const chosen = new Map<string, { product: SeedProductRef; quantity: number }>();
      for (let n = 0; n < lineCount; n += 1) {
        const product = products[Math.floor(random() * products.length)];
        chosen.set(product.id, { product, quantity: 1 + Math.floor(random() * 3) });
      }

      if (await prisma.order.findUnique({ where: { id }, select: { id: true } })) continue;

      const lines = [...chosen.values()];
      const cancelled = status === OrderStatus.CANCELLED;
      await prisma.order.create({
        data: {
          id,
          userId: customerId,
          status,
          paymentStatus: !cancelled
            ? PaymentStatus.PAID
            : refunded
              ? PaymentStatus.REFUNDED
              : PaymentStatus.FAILED,
          paymentRef: cancelled && !refunded ? null : `mock_${id}`,
          cancelReason: !cancelled
            ? null
            : refunded
              ? CancelReason.CUSTOMER_REQUEST
              : CancelReason.PAYMENT_FAILED,
          totalAmount: lines.reduce(
            (sum, { product, quantity }) =>
              sum.add(new Prisma.Decimal(product.price).mul(quantity)),
            new Prisma.Decimal(0),
          ),
          shippingAddress: '221B Baker Street, London NW1 6XE',
          idempotencyKey: `seed-${day}-${index}`,
          createdAt,
          updatedAt: createdAt,
          items: {
            create: lines.map(({ product, quantity }) => ({
              productId: product.id,
              productName: product.name,
              unitPrice: product.price,
              quantity,
            })),
          },
        },
      });
      created += 1;
    }
  }
  return created;
}
