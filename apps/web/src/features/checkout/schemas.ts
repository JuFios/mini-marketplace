import { z } from 'zod';

// Mirrors the API (`shippingAddress`, trimmed, 10-500 characters); the server stays the authority.
export const shippingSchema = z.object({
  shippingAddress: z
    .string()
    .trim()
    .min(1, 'Shipping address is required')
    .min(10, 'Shipping address must be at least 10 characters')
    .max(500, 'Shipping address must be at most 500 characters'),
});

export type ShippingValues = z.infer<typeof shippingSchema>;
