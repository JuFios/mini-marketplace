import { Prisma } from '../../generated/prisma/client';
import { MockPaymentProvider } from './mock-payment-provider';

const charge = (provider: MockPaymentProvider, orderId: string) =>
  provider.charge({ orderId, amount: new Prisma.Decimal('10.00') });

describe('MockPaymentProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('approves every order at failure rate 0, with a reference derived from the order id', async () => {
    const provider = new MockPaymentProvider({ failureRate: 0, delayMs: 0 });

    await expect(charge(provider, 'order-1')).resolves.toEqual({
      status: 'approved',
      reference: 'mock_order-1',
    });
  });

  it('declines every order at failure rate 1', async () => {
    const provider = new MockPaymentProvider({ failureRate: 1, delayMs: 0 });

    for (const id of ['a', 'b', 'c', '00000000-0000-4000-8000-000000000000']) {
      await expect(charge(provider, id)).resolves.toEqual({
        status: 'declined',
        reason: 'CARD_DECLINED',
      });
    }
  });

  it('gives the same verdict and reference every time an order is charged', async () => {
    const provider = new MockPaymentProvider({ failureRate: 0.5, delayMs: 0 });

    for (let n = 0; n < 50; n += 1) {
      const id = `order-${n}`;
      const first = await charge(provider, id);
      expect(await charge(provider, id)).toEqual(first);
      expect(await charge(provider, id)).toEqual(first);
    }
  });

  it('declines about the configured share of orders', async () => {
    const provider = new MockPaymentProvider({ failureRate: 0.3, delayMs: 0 });

    let declined = 0;
    for (let n = 0; n < 2000; n += 1) {
      if ((await charge(provider, `order-${n}`)).status === 'declined') declined += 1;
    }

    // The verdicts are fixed by the ids, so this number never changes between runs.
    expect(declined).toBeGreaterThan(500);
    expect(declined).toBeLessThan(700);
  });

  it('takes the configured time', async () => {
    jest.useFakeTimers();
    const provider = new MockPaymentProvider({ failureRate: 0, delayMs: 1500 });
    let settled = false;

    const pending = charge(provider, 'order-1').then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(1499);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await pending;

    expect(settled).toBe(true);
  });
});
