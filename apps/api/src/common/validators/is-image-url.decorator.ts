import { isURL, registerDecorator, ValidationOptions } from 'class-validator';

const UPLOADED_IMAGE = /^\/uploads\/[A-Za-z0-9-]+\.(png|jpg|webp)$/;
export const IMAGE_URL_MAX_LENGTH = 2048;

/**
 * Either a file produced by the upload endpoint or an absolute http(s) URL. The URL is only
 * stored and handed to browsers; the server never fetches it (no SSRF).
 */
export function IsImageUrl(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isImageUrl',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: {
        message: '$property must be an /uploads/ path or an absolute http(s) URL',
        ...options,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.length > IMAGE_URL_MAX_LENGTH) return false;
          return (
            UPLOADED_IMAGE.test(value) ||
            isURL(value, { protocols: ['http', 'https'], require_protocol: true })
          );
        },
      },
    });
}
