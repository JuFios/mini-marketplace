import { INestApplication } from '@nestjs/common';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { InventoryRepository } from '../src/modules/orders/inventory.repository';
import { createTestApp } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

describe('InventoryRepository (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inventory: InventoryRepository;
  let categoryId: string;

  const product = (stock: number, deletedAt: Date | null = null) =>
    prisma.product.create({
      data: { name: 'Mouse', description: '', price: '24.99', stock, categoryId, deletedAt },
    });
  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    inventory = app.get(InventoryRepository);
  });

  beforeEach(async () => {
    await resetDb(app);
    categoryId = (await prisma.category.create({ data: { name: 'Mice' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('decrementStock', () => {
    it('takes the units and returns the row’s name and exact price', async () => {
      const { id } = await product(5);

      const row = await prisma.$transaction((tx) => inventory.decrementStock(id, 2, tx));

      expect(row).toEqual({ id, name: 'Mouse', price: new Prisma.Decimal('24.99') });
      expect(row?.price).toBeInstanceOf(Prisma.Decimal);
      expect(await stockOf(id)).toBe(3);
    });

    it('may take the very last unit', async () => {
      const { id } = await product(2);

      await prisma.$transaction((tx) => inventory.decrementStock(id, 2, tx));

      expect(await stockOf(id)).toBe(0);
    });

    it('returns null and changes nothing when there are fewer units than asked for', async () => {
      const { id } = await product(2);

      const row = await prisma.$transaction((tx) => inventory.decrementStock(id, 3, tx));

      expect(row).toBeNull();
      expect(await stockOf(id)).toBe(2);
    });

    it('returns null for an archived product, whatever its stock', async () => {
      const { id } = await product(10, new Date());

      expect(await prisma.$transaction((tx) => inventory.decrementStock(id, 1, tx))).toBeNull();
      expect(await stockOf(id)).toBe(10);
    });

    it('is undone with the transaction', async () => {
      const { id } = await product(5);

      await expect(
        prisma.$transaction(async (tx) => {
          await inventory.decrementStock(id, 4, tx);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');

      expect(await stockOf(id)).toBe(5);
    });
  });

  describe('restock', () => {
    it('puts the units of every line back, archived products included', async () => {
      const live = await product(1);
      const archived = await product(0, new Date());

      await prisma.$transaction((tx) =>
        inventory.restock(
          [
            { productId: archived.id, quantity: 2 },
            { productId: live.id, quantity: 3 },
          ],
          tx,
        ),
      );

      expect(await stockOf(live.id)).toBe(4);
      expect(await stockOf(archived.id)).toBe(2);
    });
  });
});
