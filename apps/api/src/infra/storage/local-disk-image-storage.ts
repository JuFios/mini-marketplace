import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AppConfigService } from '../../config/app-config.service';
import type { ImageStorage } from './image-storage';
import type { ImageExtension } from './image-type';

export const UPLOADS_URL_PREFIX = '/uploads';

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
}
