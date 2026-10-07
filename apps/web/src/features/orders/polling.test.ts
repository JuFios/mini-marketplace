import { describe, expect, it } from 'vitest';
import { hasPollingTimedOut, orderPollInterval, ORDER_POLLING } from './polling';

const NEW = { status: 'NEW' } as const;

describe('orderPollInterval', () => {
  it('asks again every two seconds while the order is NEW', () => {
    expect(orderPollInterval(NEW, 0)).toBe(2_000);
    expect(orderPollInterval(NEW, 29_999)).toBe(2_000);
  });

  it('stops after the window, even though the order is still NEW', () => {
    expect(orderPollInterval(NEW, 30_000)).toBe(false);
    expect(orderPollInterval(NEW, 120_000)).toBe(false);
  });

  it('stops as soon as the status is no longer NEW', () => {
    for (const status of ['PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const) {
      expect(orderPollInterval({ status }, 0)).toBe(false);
    }
  });

  it('does not poll before there is an order to look at', () => {
    expect(orderPollInterval(undefined, 0)).toBe(false);
  });

  it('takes the timing it is given', () => {
    expect(orderPollInterval(NEW, 50, { intervalMs: 10, windowMs: 100 })).toBe(10);
    expect(orderPollInterval(NEW, 100, { intervalMs: 10, windowMs: 100 })).toBe(false);
  });

  it('defaults to a two-second interval inside a thirty-second window', () => {
    expect(ORDER_POLLING).toEqual({ intervalMs: 2_000, windowMs: 30_000 });
  });
});

describe('hasPollingTimedOut', () => {
  it('is true only for a NEW order whose window has passed', () => {
    expect(hasPollingTimedOut(NEW, 30_000)).toBe(true);
    expect(hasPollingTimedOut(NEW, 10_000)).toBe(false);
    expect(hasPollingTimedOut({ status: 'PROCESSING' }, 60_000)).toBe(false);
    expect(hasPollingTimedOut(undefined, 60_000)).toBe(false);
  });
});
