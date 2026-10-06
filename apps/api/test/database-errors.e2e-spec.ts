import { INestApplication } from '@nestjs/common';
import { toAppException } from '../src/common/filters/exception-mapper';
import { readDatabaseError } from '../src/common/filters/database-error';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

/** Runs `action`, which must fail, and returns what it threw. */
async function thrownBy(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the database to reject the statement');
}

/** Lets `parties` concurrent callers wait for each other before any of them continues. */
function barrier(parties: number): () => Promise<void> {
  let waiting = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    waiting += 1;
    if (waiting === parties) release();
    await gate;
  };
}

describe('database constraints and error mapping (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;

  const productData = (overrides: { name?: string; price?: string; stock?: number } = {}) => ({
    name: overrides.name ?? 'Widget',
    description: 'A widget',
    price: overrides.price ?? '10.00',
    stock: overrides.stock ?? 5,
    categoryId,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    categoryId = (await prisma.category.create({ data: { name: 'Gadgets' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('CHECK constraints', () => {
    it('rejects inserting a product with negative stock', async () => {
      const error = await thrownBy(() =>
        prisma.product.create({ data: productData({ stock: -1 }) }),
      );

      expect(readDatabaseError(error)).toMatchObject({
        sqlState: '23514',
        checkConstraint: 'products_stock_non_negative',
      });
      expect(toAppException(error).code).toBe('INSUFFICIENT_STOCK');
    });

    it('rejects a raw UPDATE that would take stock below zero', async () => {
      const { id } = await prisma.product.create({ data: productData({ stock: 1 }) });

      const error = await thrownBy(
        () => prisma.$executeRaw`UPDATE products SET stock = stock - 2 WHERE id = ${id}::uuid`,
      );

      expect(toAppException(error)).toMatchObject({ httpStatus: 409, code: 'INSUFFICIENT_STOCK' });
      expect((await prisma.product.findUniqueOrThrow({ where: { id } })).stock).toBe(1);
    });

    it('rejects a non-positive price', async () => {
      const error = await thrownBy(() =>
        prisma.product.create({ data: productData({ price: '0.00' }) }),
      );

      expect(readDatabaseError(error)?.checkConstraint).toBe('products_price_positive');
    });

    it('rejects a cart quantity outside 1..99', async () => {
      const { id: productId } = await prisma.product.create({ data: productData() });
      const { id: userId } = await prisma.user.create({
        data: { email: 'a@example.com', name: 'A', passwordHash: 'x' },
      });

      for (const quantity of [0, 100]) {
        const error = await thrownBy(() =>
          prisma.cartItem.create({ data: { userId, productId, quantity } }),
        );
        expect(toAppException(error).code).toBe('CART_LIMIT_EXCEEDED');
      }
    });
  });

  describe('uniqueness and references', () => {
    it('maps a duplicate category name to 409 CONFLICT', async () => {
      const error = await thrownBy(() => prisma.category.create({ data: { name: 'Gadgets' } }));

      expect(toAppException(error)).toMatchObject({ httpStatus: 409, code: 'CONFLICT' });
    });

    it('maps a duplicate raised by raw SQL to 409 CONFLICT too', async () => {
      const error = await thrownBy(
        () =>
          prisma.$executeRaw`INSERT INTO categories (id, name, updated_at) VALUES (gen_random_uuid(), 'Gadgets', now())`,
      );

      expect(toAppException(error)).toMatchObject({ httpStatus: 409, code: 'CONFLICT' });
    });

    it('restricts deleting a category that still has products', async () => {
      await prisma.product.create({ data: productData() });

      const error = await thrownBy(() => prisma.category.delete({ where: { id: categoryId } }));

      expect(toAppException(error)).toMatchObject({ httpStatus: 409, code: 'CONFLICT' });
    });

    it('maps updating a missing row to 404', async () => {
      const error = await thrownBy(() =>
        prisma.category.update({
          where: { id: '00000000-0000-0000-0000-000000000000' },
          data: { name: 'Nothing' },
        }),
      );

      expect(toAppException(error)).toMatchObject({ httpStatus: 404, code: 'NOT_FOUND' });
    });
  });

  describe('concurrency', () => {
    it('maps a real deadlock to the retryable 409 CONCURRENT_UPDATE', async () => {
      const first = await prisma.product.create({ data: productData({ name: 'First' }) });
      const second = await prisma.product.create({ data: productData({ name: 'Second' }) });
      const bothHoldTheirFirstLock = barrier(2);

      // Each transaction locks one row, waits until the other holds its row too, then reaches
      // for the other's: a guaranteed lock cycle, with no timing assumptions.
      const crossLock = (own: string, other: string) =>
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`UPDATE products SET stock = stock + 1 WHERE id = ${own}::uuid`;
          await bothHoldTheirFirstLock();
          await tx.$executeRaw`UPDATE products SET stock = stock + 1 WHERE id = ${other}::uuid`;
        });

      const outcomes = await Promise.allSettled([
        crossLock(first.id, second.id),
        crossLock(second.id, first.id),
      ]);

      const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(failures).toHaveLength(1);
      expect(toAppException(failures[0].reason)).toMatchObject({
        httpStatus: 409,
        code: 'CONCURRENT_UPDATE',
      });
    });
  });
});
