import type { PinoLogger } from 'nestjs-pino';
import type { CategoriesService } from '../categories/categories.service';
import { ProductsService } from './products.service';

function setup() {
  const products = {
    adjustStock: jest.fn(),
    findStockState: jest.fn(),
    archive: jest.fn(),
    create: jest.fn(),
  };
  const categories = { assertExists: jest.fn().mockResolvedValue(undefined) };
  const catalogCache = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const logger = { info: jest.fn(), setContext: jest.fn() };
  const service = new ProductsService(
    products as never,
    categories as unknown as CategoriesService,
    catalogCache as never,
    logger as unknown as PinoLogger,
  );
  return { service, products, categories, catalogCache, logger };
}

describe('ProductsService.adjustStock', () => {
  it('returns the new stock and logs the adjustment with who made it', async () => {
    const { service, products, logger } = setup();
    products.adjustStock.mockResolvedValue(12);

    const result = await service.adjustStock('p1', { delta: 2, reason: 'recount' }, 'admin-1');

    expect(result).toEqual({ id: 'p1', stock: 12 });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'stock.adjusted',
        productId: 'p1',
        delta: 2,
        stock: 12,
        adminId: 'admin-1',
      }),
      expect.any(String),
    );
  });

  it('answers 409 INSUFFICIENT_STOCK with the numbers when the result would be negative', async () => {
    const { service, products } = setup();
    products.adjustStock.mockResolvedValue(null);
    products.findStockState.mockResolvedValue({ stock: 3, deletedAt: null });

    await expect(service.adjustStock('p1', { delta: -5 }, 'a')).rejects.toMatchObject({
      httpStatus: 409,
      code: 'INSUFFICIENT_STOCK',
      details: [{ productId: 'p1', requested: -5, available: 3 }],
    });
  });

  it('answers 400 VALIDATION_FAILED on delta when an addition would pass the stock limit', async () => {
    const { service, products, catalogCache, logger } = setup();
    products.adjustStock.mockResolvedValue(null);
    products.findStockState.mockResolvedValue({ stock: 999_995, deletedAt: null });

    await expect(service.adjustStock('p1', { delta: 6 }, 'a')).rejects.toMatchObject({
      httpStatus: 400,
      code: 'VALIDATION_FAILED',
      details: [
        { field: 'delta', messages: ['Stock cannot go above 1000000 (current stock: 999995)'] },
      ],
    });
    expect(catalogCache.invalidate).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('answers 409 PRODUCT_UNAVAILABLE for an archived product', async () => {
    const { service, products } = setup();
    products.adjustStock.mockResolvedValue(null);
    products.findStockState.mockResolvedValue({ stock: 3, deletedAt: new Date() });

    await expect(service.adjustStock('p1', { delta: 1 }, 'a')).rejects.toMatchObject({
      code: 'PRODUCT_UNAVAILABLE',
    });
  });

  it('answers 404 PRODUCT_NOT_FOUND for an unknown product', async () => {
    const { service, products, logger } = setup();
    products.adjustStock.mockResolvedValue(null);
    products.findStockState.mockResolvedValue(null);

    await expect(service.adjustStock('p1', { delta: 1 }, 'a')).rejects.toMatchObject({
      httpStatus: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('ProductsService archive and create', () => {
  it('archiving an already archived product is not an error', async () => {
    const { service, products } = setup();
    products.archive.mockResolvedValue(false);
    products.findStockState.mockResolvedValue({ stock: 1, deletedAt: new Date() });

    await expect(service.archive('p1')).resolves.toBeUndefined();
  });

  it('archiving a missing product is a 404', async () => {
    const { service, products } = setup();
    products.archive.mockResolvedValue(false);
    products.findStockState.mockResolvedValue(null);

    await expect(service.archive('p1')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('does not create a product in a category that does not exist', async () => {
    const { service, products, categories } = setup();
    categories.assertExists.mockRejectedValue(new Error('CATEGORY_NOT_FOUND'));

    await expect(
      service.create({ name: 'n', description: '', price: '1.00', categoryId: 'c', stock: 1 }),
    ).rejects.toThrow('CATEGORY_NOT_FOUND');
    expect(products.create).not.toHaveBeenCalled();
  });
});
