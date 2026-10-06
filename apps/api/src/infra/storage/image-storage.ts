import type { ImageExtension } from './image-type';

export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

/** Where uploaded images live. The rest of the app only knows this interface (S3 could replace it). */
export interface ImageStorage {
  /** Stores the image under a server-generated name and returns the URL path to serve it from. */
  save(content: Buffer, extension: ImageExtension): Promise<string>;
}
