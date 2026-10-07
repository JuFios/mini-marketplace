import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { IMAGE_STORAGE } from '../../../infra/storage/image-storage';
import type { ImageStorage } from '../../../infra/storage/image-storage';
import { ProductsRepository } from '../products.repository';
import { ORPHAN_IMAGE_MIN_AGE_MS } from './image-cleanup.constants';

export interface ImageSweepResult {
  /** Unused and old enough: removed. */
  deleted: number;
  /** Old enough, but a product uses it. */
  kept: number;
  /** Could not be removed this time; the next sweep tries again. */
  failed: number;
}

/**
 * Deletes uploaded pictures that no product points to any more: the one a product had before its
 * picture was replaced or cleared, and those uploaded in a form that was never saved. Nothing
 * else removes pictures, so without this the volume only grows.
 *
 * Only a picture older than `ORPHAN_IMAGE_MIN_AGE_MS` is considered, which keeps it clear of any
 * picture that is on its way to a product. Products are read after the listing, so a picture
 * attached in between is seen as used. Safe to run any number of times, one after the other or at
 * once: removing a file that is gone is not an error.
 */
@Injectable()
export class OrphanImageSweeper {
  constructor(
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
    private readonly products: ProductsRepository,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(OrphanImageSweeper.name);
  }

  async sweep(now: Date = new Date()): Promise<ImageSweepResult> {
    const result: ImageSweepResult = { deleted: 0, kept: 0, failed: 0 };
    const oldEnough = new Date(now.getTime() - ORPHAN_IMAGE_MIN_AGE_MS);
    const candidates = (await this.storage.list()).filter((image) => image.modifiedAt < oldEnough);
    if (candidates.length === 0) return result;

    const used = new Set(await this.products.findUploadedImageUrls());
    for (const { url } of candidates) {
      if (used.has(url)) {
        result.kept += 1;
        continue;
      }
      try {
        await this.storage.delete(url);
        result.deleted += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.warn({ err: error, url }, 'Deleting an unused image failed');
      }
    }

    if (result.deleted + result.failed > 0) {
      this.logger.info({ event: 'images.swept', ...result }, 'Unused product images removed');
    }
    return result;
  }
}
