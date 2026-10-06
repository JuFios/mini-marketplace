import { createHash } from 'node:crypto';
import type { ChargeRequest, ChargeResult, PaymentProvider } from './payment-provider';

export interface MockPaymentOptions {
  /** Share of orders that are declined, from 0 (none) to 1 (all). */
  failureRate: number;
  /** How long a charge takes, in milliseconds. */
  delayMs: number;
}

/** Position of an order in [0, 1), fixed by its id: the same order always gets the same one. */
function rollFor(orderId: string): number {
  return createHash('sha256').update(orderId).digest().readUInt32BE(0) / 2 ** 32;
}

/**
 * Stand-in for a payment gateway. Like a real one it is idempotent per order: the reference is
 * derived from the order id and so is the verdict (an order is declined when its position in
 * [0, 1) is below the failure rate), so a retried charge can never flip from declined to
 * approved. A rate of 0 approves everything and 1 declines everything, which is what tests use.
 */
export class MockPaymentProvider implements PaymentProvider {
  constructor(private readonly options: MockPaymentOptions) {}

  async charge({ orderId }: ChargeRequest): Promise<ChargeResult> {
    if (this.options.delayMs > 0) await delay(this.options.delayMs);
    if (rollFor(orderId) < this.options.failureRate) {
      return { status: 'declined', reason: 'CARD_DECLINED' };
    }
    return { status: 'approved', reference: `mock_${orderId}` };
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
