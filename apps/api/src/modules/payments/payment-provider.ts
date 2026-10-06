import type { Prisma } from '../../generated/prisma/client';

export interface ChargeRequest {
  orderId: string;
  amount: Prisma.Decimal;
}

/**
 * A decline is a business outcome (the order is cancelled and not retried); a provider that
 * cannot be reached throws instead, which the queue retries.
 */
export type ChargeResult =
  { status: 'approved'; reference: string } | { status: 'declined'; reason: string };

export interface PaymentProvider {
  /** Idempotent per order: charging the same order again gives the same result and reference. */
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
