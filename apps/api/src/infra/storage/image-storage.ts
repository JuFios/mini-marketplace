import type { ImageExtension } from './image-type';

export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

/** An image the storage holds: the URL path it is served from, and when it was written. */
export interface StoredImage {
  url: string;
  modifiedAt: Date;
}

/** Where uploaded images live. The rest of the app only knows this interface (S3 could replace it). */
export interface ImageStorage {
  /** Stores the image under a server-generated name and returns the URL path to serve it from. */
  save(content: Buffer, extension: ImageExtension): Promise<string>;

  /** Every image `save` has stored and nobody has deleted; nothing else the storage may hold. */
  list(): Promise<StoredImage[]>;

  /**
   * Removes the image behind `url`. Deleting what is gone is not an error, and neither is a URL
   * that is not one of this storage's own (an external link): there is nothing of ours to remove.
   */
  delete(url: string): Promise<void>;
}
