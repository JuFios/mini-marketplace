import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AppConfigService } from '../../config/app-config.service';
import type { ImageStorage, StoredImage } from './image-storage';
import type { ImageExtension } from './image-type';

export const UPLOADS_URL_PREFIX = '/uploads';

// The names `save` generates, and the only ones `list` and `delete` touch: whatever else sits in
// the directory (a mounted volume's own files, something a person put there) is left alone, and
// no URL can lead out of the directory.
const STORED_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

@Injectable()
export class LocalDiskImageStorage implements ImageStorage {
  readonly directory: string;

  constructor(config: AppConfigService) {
    this.directory = resolve(config.uploadDir);
  }

  async save(content: Buffer, extension: ImageExtension): Promise<string> {
    // The name is generated here, never derived from the upload: no path tricks, no collisions.
    const fileName = `${randomUUID()}.${extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, fileName), content, { flag: 'wx' });
    return `${UPLOADS_URL_PREFIX}/${fileName}`;
  }

  async list(): Promise<StoredImage[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      // Nothing has been uploaded yet: the directory is created by the first `save`.
      if (isMissing(error)) return [];
      throw error;
    }

    const images: StoredImage[] = [];
    for (const name of names.filter((candidate) => STORED_FILE_NAME.test(candidate))) {
      try {
        const { mtime } = await stat(join(this.directory, name));
        images.push({ url: `${UPLOADS_URL_PREFIX}/${name}`, modifiedAt: mtime });
      } catch (error) {
        // Deleted between the listing and the stat.
        if (!isMissing(error)) throw error;
      }
    }
    return images;
  }

  async delete(url: string): Promise<void> {
    const prefix = `${UPLOADS_URL_PREFIX}/`;
    if (!url.startsWith(prefix)) return;
    const name = url.slice(prefix.length);
    if (!STORED_FILE_NAME.test(name)) return;
    await rm(join(this.directory, name), { force: true });
  }
}
