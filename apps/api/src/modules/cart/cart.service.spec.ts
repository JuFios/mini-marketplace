import type { ProductsService } from '../products/products.service';
import type { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

const USER = 'user-1';
const PRODUCT = 'product-1';

function setup(
  options: {
    stock?: number;
    archived?: boolean;
    missing?: boolean;
    existing?: number | null;
    lines?: number;
  } = {},
) {
  const { stock = 10, archived = false, missing = false, existing = null, lines = 0 } = options;
  const repo = {
    findLines: jest.fn().mockResolvedValue([]),
    findQuantity: jest.fn().mockResolvedValue(existing),
    countLines: jest.fn().mockResolvedValue(lines),
    addQuantity: jest.fn().mockResolvedValue(undefined),
    setQuantity: jest.fn().mockResolvedValue(undefined),
    removeLine: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const products = {
    getAvailability: jest.fn().mockResolvedValue(missing ? null : { stock, isArchived: archived }),
  };
  const service = new CartService(
    repo as unknown as CartRepository,
    products as unknown as ProductsService,
  );
  return { service, repo };
}

describe('CartService', () => {
  describe('addItem', () => {
    it('adds to the existing quantity and returns the whole cart', async () => {
      const { service, repo } = setup({ existing: 2 });

      const cart = await service.addItem(USER, PRODUCT, 3);

      expect(repo.addQuantity).toHaveBeenCalledWith(USER, PRODUCT, 3);
      expect(cart).toMatchObject({ items: [], subtotal: '0.00' });
    });

    it('accepts a result exactly equal to the stock and to the 99-unit cap', async () => {
      await expect(
        setup({ stock: 99, existing: 90 }).service.addItem(USER, PRODUCT, 9),
      ).resolves.toBeDefined();
      await expect(
        setup({ stock: 5, existing: 2 }).service.addItem(USER, PRODUCT, 3),
      ).resolves.toBeDefined();
    });

    it('refuses a result above stock with the numbers, counting what is already in the cart', async () => {
      const { service, repo } = setup({ stock: 5, existing: 4 });

      await expect(service.addItem(USER, PRODUCT, 2)).rejects.toMatchObject({
        httpStatus: 409,
        code: 'INSUFFICIENT_STOCK',
        details: [{ productId: PRODUCT, requested: 6, available: 5 }],
      });
      expect(repo.addQuantity).not.toHaveBeenCalled();
    });

    it('refuses a sold-out product', async () => {
      await expect(setup({ stock: 0 }).service.addItem(USER, PRODUCT, 1)).rejects.toMatchObject({
        code: 'INSUFFICIENT_STOCK',
      });
    });

    it('refuses a line above 99 units even when stock allows it', async () => {
      const { service, repo } = setup({ stock: 500, existing: 98 });

      await expect(service.addItem(USER, PRODUCT, 2)).rejects.toMatchObject({
        code: 'CART_LIMIT_EXCEEDED',
      });
      expect(repo.addQuantity).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown product and 409 PRODUCT_UNAVAILABLE for an archived one', async () => {
      await expect(
        setup({ missing: true }).service.addItem(USER, PRODUCT, 1),
      ).rejects.toMatchObject({
        httpStatus: 404,
        code: 'PRODUCT_NOT_FOUND',
      });
      await expect(
        setup({ archived: true }).service.addItem(USER, PRODUCT, 1),
      ).rejects.toMatchObject({
        httpStatus: 409,
        code: 'PRODUCT_UNAVAILABLE',
      });
    });

    it('refuses a 51st distinct product but still tops up one already in the cart', async () => {
      const full = setup({ lines: 50, existing: null });
      await expect(full.service.addItem(USER, PRODUCT, 1)).rejects.toMatchObject({
        code: 'CART_LIMIT_EXCEEDED',
      });
      expect(full.repo.addQuantity).not.toHaveBeenCalled();

      await expect(
        setup({ lines: 50, existing: 1 }).service.addItem(USER, PRODUCT, 1),
      ).resolves.toBeDefined();
      await expect(
        setup({ lines: 49, existing: null }).service.addItem(USER, PRODUCT, 1),
      ).resolves.toBeDefined();
    });
  });

  describe('setQuantity', () => {
    it('sets an absolute value, ignoring what the line held before', async () => {
      const { service, repo } = setup({ existing: 8, stock: 10 });

      await service.setQuantity(USER, PRODUCT, 1);

      expect(repo.setQuantity).toHaveBeenCalledWith(USER, PRODUCT, 1);
    });

    it('applies the same stock, availability and line-count rules', async () => {
      await expect(setup({ stock: 3 }).service.setQuantity(USER, PRODUCT, 4)).rejects.toMatchObject(
        { code: 'INSUFFICIENT_STOCK' },
      );
      await expect(
        setup({ archived: true }).service.setQuantity(USER, PRODUCT, 1),
      ).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
      await expect(
        setup({ missing: true }).service.setQuantity(USER, PRODUCT, 1),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      await expect(
        setup({ lines: 50 }).service.setQuantity(USER, PRODUCT, 1),
      ).rejects.toMatchObject({ code: 'CART_LIMIT_EXCEEDED' });
    });

    it('may lower the quantity of a line whose stock has since dropped, as long as it fits', async () => {
      await expect(
        setup({ stock: 2, existing: 6 }).service.setQuantity(USER, PRODUCT, 2),
      ).resolves.toBeDefined();
    });
  });

  describe('removeItem and clear', () => {
    it('remove does not require the line, or even the product, to exist', async () => {
      const { service, repo } = setup({ missing: true });

      await expect(service.removeItem(USER, PRODUCT)).resolves.toBeDefined();
      await expect(service.removeItem(USER, PRODUCT)).resolves.toBeDefined();

      expect(repo.removeLine).toHaveBeenCalledTimes(2);
    });

    it('clear empties the cart and returns it', async () => {
      const { service, repo } = setup();

      await expect(service.clear(USER)).resolves.toMatchObject({ items: [], totalQuantity: 0 });
      expect(repo.clear).toHaveBeenCalledWith(USER);
    });
  });
});
