import { z } from 'zod';
import { toCents } from '@/shared/lib/money';

// These mirror the API's validation so most mistakes are caught before a request is made; the
// server stays the authority and its answers are shown the same way (see `applyFieldErrors`).

const MAX_PRICE_CENTS = 1_000_000_00;
const MAX_STOCK = 1_000_000;
const PRICE = /^\d{1,7}(\.\d{1,2})?$/;
// What the API accepts as `imageUrl`: an uploaded file's path, or an absolute https address (the
// app's Content-Security-Policy would block a picture served over plain http).
const UPLOADED_IMAGE =
  /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i;
const WEB_URL = /^https:\/\/\S+$/i;

export function isImageUrl(value: string): boolean {
  return value.length <= 2048 && (UPLOADED_IMAGE.test(value) || WEB_URL.test(value));
}

// The fields are text while they are edited; `payload.ts` turns them into what the API takes.
export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(200, 'Name must be at most 200 characters'),
  description: z.string().max(5000, 'Description must be at most 5000 characters'),
  price: z
    .string()
    .trim()
    .min(1, 'Price is required')
    .refine((value) => PRICE.test(value), 'Use a price like 19.99')
    .refine((value) => !PRICE.test(value) || toCents(value) >= 1, 'Price must be at least 0.01')
    .refine(
      (value) => !PRICE.test(value) || toCents(value) <= MAX_PRICE_CENTS,
      'Price must be at most 1000000.00',
    ),
  categoryId: z.string().min(1, 'Choose a category'),
  stock: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value), 'Stock must be a whole number')
    .refine((value) => !/^\d+$/.test(value) || Number(value) <= MAX_STOCK, 'Stock is too large'),
  imageUrl: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || isImageUrl(value),
      'Use an uploaded image or an https address',
    ),
});

export type ProductValues = z.infer<typeof productSchema>;

export const EMPTY_PRODUCT: ProductValues = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
  stock: '0',
  imageUrl: '',
};

const MAX_DELTA = 1_000_000;

/**
 * The stock adjustment dialog's fields. `currentStock` bounds the delta: stock may not go below 0,
 * and an addition may not take it past the limit a new product has. Like the API, removals are
 * not capped: a cancelled order puts its units back even above the limit.
 */
export function stockAdjustmentSchema(currentStock: number) {
  return z.object({
    delta: z
      .string()
      .trim()
      .refine((value) => /^[+-]?\d+$/.test(value), 'Enter a whole number, like 5 or -3')
      .refine((value) => !/^[+-]?\d+$/.test(value) || Number(value) !== 0, 'The change cannot be 0')
      .refine(
        (value) => !/^[+-]?\d+$/.test(value) || Math.abs(Number(value)) <= MAX_DELTA,
        'The change is too large',
      )
      .refine(
        (value) => !/^[+-]?\d+$/.test(value) || currentStock + Number(value) >= 0,
        `Stock cannot go below 0 (there are ${currentStock})`,
      )
      .refine(
        (value) =>
          !/^[+-]?\d+$/.test(value) ||
          Number(value) < 0 ||
          currentStock + Number(value) <= MAX_STOCK,
        `Stock cannot go above ${MAX_STOCK} (there are ${currentStock})`,
      ),
    reason: z.string().trim().max(200, 'Reason must be at most 200 characters'),
  });
}

export type StockAdjustmentValues = z.infer<ReturnType<typeof stockAdjustmentSchema>>;
