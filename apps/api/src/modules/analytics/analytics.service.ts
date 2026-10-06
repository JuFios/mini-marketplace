import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { utcDayBounds } from '../../common/utils/utc-days';
import { AnalyticsRepository } from './analytics.repository';
import { resolveDateRange } from './date-range';
import type { SalesByDayResponse, SummaryResponse } from './dto/analytics.response.dto';
import type { DateRangeQueryDto } from './dto/date-range-query.dto';

const TOP_PRODUCTS = 5;

/** Revenue figures for administrators. All days are UTC; see `resolveDateRange` for the defaults. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async summary(query: DateRangeQueryDto): Promise<SummaryResponse> {
    const { from, to } = resolveDateRange(query, new Date());
    const { start, end } = utcDayBounds(from, to);

    const [totals, top] = await Promise.all([
      this.analytics.totals(start, end),
      this.analytics.topProducts(start, end, TOP_PRODUCTS),
    ]);
    return {
      from,
      to,
      totalRevenue: totals.revenue.toFixed(2),
      ordersCount: totals.ordersCount,
      averageOrderValue: averageOrderValue(totals.revenue, totals.ordersCount),
      topProducts: top.map((row) => ({
        productId: row.productId,
        name: row.name,
        quantitySold: row.quantitySold,
        revenue: row.revenue.toFixed(2),
      })),
    };
  }

  async salesByDay(query: DateRangeQueryDto): Promise<SalesByDayResponse> {
    const { from, to } = resolveDateRange(query, new Date());
    const days = await this.analytics.salesByDay(from, to);
    return {
      from,
      to,
      days: days.map((day) => ({
        date: day.date,
        revenue: day.revenue.toFixed(2),
        ordersCount: day.ordersCount,
      })),
    };
  }
}

/** Exact decimal division, rounded half up to cents; there is no average of no orders. */
function averageOrderValue(revenue: Prisma.Decimal, ordersCount: number): string {
  if (ordersCount === 0) return '0.00';
  return revenue.div(ordersCount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}
