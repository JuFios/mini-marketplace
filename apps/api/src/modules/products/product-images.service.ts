import { Inject, Injectable } from '@nestjs/common';
import {
  UnsupportedMediaTypeException,
  ValidationFailedException,
} from '../../common/exceptions/app.exception';
import { IMAGE_STORAGE } from '../../infra/storage/image-storage';
import type { ImageStorage } from '../../infra/storage/image-storage';
import { detectImageType } from '../../infra/storage/image-type';
import type { ImageUploadResponse } from './dto/product.response.dto';

@Injectable()
export class ProductImagesService {
  constructor(@Inject(IMAGE_STORAGE) private readonly storage: ImageStorage) {}

  async upload(file: Express.Multer.File | undefined): Promise<ImageUploadResponse> {
    if (!file) {
      throw new ValidationFailedException([
        { field: 'file', messages: ['file is required (multipart field "file")'] },
      ]);
    }
    // Judged by content, not by the declared type or extension.
    const extension = detectImageType(file.buffer);
    if (!extension)
      throw new UnsupportedMediaTypeException('Only PNG, JPEG and WebP images are accepted');
    return { url: await this.storage.save(file.buffer, extension) };
  }
}
