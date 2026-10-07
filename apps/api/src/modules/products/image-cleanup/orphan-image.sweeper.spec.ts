import type { PinoLogger } from 'nestjs-pino';
import type { StoredImage } from '../../../infra/storage/image-storage';
import type { ProductsRepository } from '../products.repository';
import { ORPHAN_IMAGE_MIN_AGE_MS } from './image-cleanup.constants';
import { OrphanImageSweeper } from './orphan-image.sweeper';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 60 * 60_000;
const OLD = ago(ORPHAN_IMAGE_MIN_AGE_MS + HOUR);

const image = (name: string, modifiedAt: Date): StoredImage => ({
  url: `/uploads/${name}.png`,
  modifiedAt,
});

function setup(stored: StoredImage[], used: string[] = []) {
  const storage = {
    save: jest.fn(),
    list: jest.fn(() => Promise.resolve(stored)),
    delete: jest.fn((_url: string) => Promise.resolve()),
  };
  const products = { findUploadedImageUrls: jest.fn(() => Promise.resolve(used)) };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const sweeper = new OrphanImageSweeper(
    storage,
    products as unknown as ProductsRepository,
    logger as unknown as PinoLogger,
  );
  return { sweeper, storage, products, logger };
}

describe('OrphanImageSweeper', () => {
  it('deletes an old picture that no product uses', async () => {
    const { sweeper, storage } = setup([image('gone', OLD)]);

    const result = await sweeper.sweep(NOW);

    expect(storage.delete).toHaveBeenCalledWith('/uploads/gone.png');
    expect(result).toEqual({ deleted: 1, kept: 0, failed: 0 });
  });

  it('keeps an old picture that a product uses', async () => {
    const { sweeper, storage } = setup([image('in-use', OLD)], ['/uploads/in-use.png']);

    const result = await sweeper.sweep(NOW);

    expect(storage.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: 0, kept: 1, failed: 0 });
  });

  it('keeps a young picture even when no product uses it yet: its form may still be open', async () => {
    const { sweeper, storage, products } = setup([
      image('just-uploaded', ago(5 * 60_000)),
      image('almost-old-enough', ago(ORPHAN_IMAGE_MIN_AGE_MS - 1)),
    ]);

    const result = await sweeper.sweep(NOW);

    expect(storage.delete).not.toHaveBeenCalled();
    // Nothing is old enough to be judged, so the products are not even read.
    expect(products.findUploadedImageUrls).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: 0, kept: 0, failed: 0 });
  });

  it('sorts a mixed directory: only the old and unused ones go', async () => {
    const { sweeper, storage } = setup(
      [
        image('unused-old', OLD),
        image('used-old', OLD),
        image('unused-young', ago(HOUR)),
        image('unused-old-too', ago(ORPHAN_IMAGE_MIN_AGE_MS * 3)),
      ],
      ['/uploads/used-old.png'],
    );

    const result = await sweeper.sweep(NOW);

    expect(storage.delete.mock.calls.map(([url]) => url)).toEqual([
      '/uploads/unused-old.png',
      '/uploads/unused-old-too.png',
    ]);
    expect(result).toEqual({ deleted: 2, kept: 1, failed: 0 });
  });

  it('reads the products after the listing, so a picture attached meanwhile counts as used', async () => {
    const { sweeper, storage, products } = setup([image('late', OLD)]);
    const order: string[] = [];
    storage.list.mockImplementation(() => {
      order.push('list');
      return Promise.resolve([image('late', OLD)]);
    });
    products.findUploadedImageUrls.mockImplementation(() => {
      order.push('products');
      return Promise.resolve([]);
    });

    await sweeper.sweep(NOW);

    expect(order).toEqual(['list', 'products']);
  });

  it('carries on after a file that cannot be removed, and reports it', async () => {
    const { sweeper, storage, logger } = setup([image('stuck', OLD), image('fine', OLD)]);
    storage.delete.mockRejectedValueOnce(new Error('EBUSY'));

    const result = await sweeper.sweep(NOW);

    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ deleted: 1, kept: 0, failed: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/uploads/stuck.png' }),
      expect.any(String),
    );
  });

  it('logs a sweep that changed something, and stays quiet otherwise', async () => {
    const busy = setup([image('gone', OLD)]);
    await busy.sweeper.sweep(NOW);
    expect(busy.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'images.swept', deleted: 1 }),
      expect.any(String),
    );

    const idle = setup([image('in-use', OLD)], ['/uploads/in-use.png']);
    await idle.sweeper.sweep(NOW);
    expect(idle.logger.info).not.toHaveBeenCalled();
  });

  it('lets a failure of the listing or of the products query through: the next run starts over', async () => {
    const { sweeper, storage } = setup([]);
    storage.list.mockRejectedValue(new Error('EIO'));

    await expect(sweeper.sweep(NOW)).rejects.toThrow('EIO');
  });
});
