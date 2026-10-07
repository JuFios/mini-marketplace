import { isURL, registerDecorator, ValidationOptions } from 'class-validator';

const UPLOADED_IMAGE = /^\/uploads\/[A-Za-z0-9-]+\.(png|jpg|webp)$/;
export const IMAGE_URL_MAX_LENGTH = 2048;

/**
 * Either a file produced by the upload endpoint or an absolute https URL. The URL is only
 * stored and handed to browsers; the server never fetches it (no SSRF). Plain http is refused:
 * the web app's Content-Security-Policy loads images over https only, so such a picture would be
 * saved without complaint and then never shown.
 */
export function IsImageUrl(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isImageUrl',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: {
        message: '$property must be an /uploads/ path or an absolute https URL',
        ...options,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.length > IMAGE_URL_MAX_LENGTH) return false;
          return (
            UPLOADED_IMAGE.test(value) ||
            isURL(value, { protocols: ['https'], require_protocol: true })
          );
        },
      },
    });
}
