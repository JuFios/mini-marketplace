import { Prisma } from '../../generated/prisma/client';
import type { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';

const D = (value: string) => new Prisma.Decimal(value);

function setup(totals: { revenue: string; ordersCount: number }) {
  const repo = {
    totals: jest
      .fn()
      .mockResolvedValue({ revenue: D(totals.revenue), ordersCount: totals.ordersCount }),
    topProducts: jest.fn().mockResolvedValue([]),
    salesByDay: jest.fn().mockResolvedValue([]),
  };
  return { service: new AnalyticsService(repo as unknown as AnalyticsRepository), repo };
}

describe('AnalyticsService.summary', () => {
  it('asks for the whole of both end days, in UTC', async () => {
    const { service, repo } = setup({ revenue: '0', ordersCount: 0 });

    const summary = await service.summary({ from: '2026-10-01', to: '2026-10-05' });

    expect(summary).toMatchObject({ from: '2026-10-01', to: '2026-10-05' });
    expect(repo.totals).toHaveBeenCalledWith(
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-06T00:00:00.000Z'),
    );
    expect(repo.topProducts).toHaveBeenCalledWith(
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-06T00:00:00.000Z'),
      5,
    );
  });

  it('formats money as strings with two digits', async () => {
    const { service, repo } = setup({ revenue: '318.4', ordersCount: 4 });
    repo.topProducts.mockResolvedValue([
      { productId: 'p1', name: 'Alpha', quantitySold: 3, revenue: D('30') },
    ]);

    const summary = await service.summary({ from: '2026-10-01', to: '2026-10-05' });

    expect(summary.totalRevenue).toBe('318.40');
    expect(summary.ordersCount).toBe(4);
    expect(summary.topProducts).toEqual([
      { productId: 'p1', name: 'Alpha', quantitySold: 3, revenue: '30.00' },
    ]);
  });

  it.each([
    ['318.49', 4, '79.62'], // 79.6225
    ['10.00', 3, '3.33'], // 3.3333…
    ['0.05', 2, '0.03'], // 0.025 rounds half up
    ['0.01', 4, '0.00'], // 0.0025
    ['100.00', 1, '100.00'],
    ['1000000.01', 3, '333333.34'], // 333333.3366…
  ])(
    'averages revenue %s over %i orders to %s, rounding half up',
    async (revenue, count, average) => {
      const { service } = setup({ revenue, ordersCount: count });

      const summary = await service.summary({ from: '2026-10-01', to: '2026-10-05' });

      expect(summary.averageOrderValue).toBe(average);
    },
  );

  it('has an average of 0.00, not an error, when there were no orders', async () => {
    const { service } = setup({ revenue: '0', ordersCount: 0 });

    expect(await service.summary({ from: '2026-10-01', to: '2026-10-05' })).toMatchObject({
      totalRevenue: '0.00',
      ordersCount: 0,
      averageOrderValue: '0.00',
      topProducts: [],
    });
  });

  it('refuses a range longer than 366 days before touching the database', async () => {
    const { service, repo } = setup({ revenue: '0', ordersCount: 0 });

    await expect(service.summary({ from: '2025-01-01', to: '2026-10-05' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(repo.totals).not.toHaveBeenCalled();
  });
});

describe('AnalyticsService.salesByDay', () => {
  it('returns the days as the repository gives them, money as strings', async () => {
    const { service, repo } = setup({ revenue: '0', ordersCount: 0 });
    repo.salesByDay.mockResolvedValue([
      { date: '2026-10-01', revenue: D('35.5'), ordersCount: 2 },
      { date: '2026-10-02', revenue: D('0'), ordersCount: 0 },
    ]);

    const result = await service.salesByDay({ from: '2026-10-01', to: '2026-10-02' });

    expect(repo.salesByDay).toHaveBeenCalledWith('2026-10-01', '2026-10-02');
    expect(result).toEqual({
      from: '2026-10-01',
      to: '2026-10-02',
      days: [
        { date: '2026-10-01', revenue: '35.50', ordersCount: 2 },
        { date: '2026-10-02', revenue: '0.00', ordersCount: 0 },
      ],
    });
  });
});
