import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

// A sale is an order that was paid and not cancelled. Constants, so they are plain SQL text.
const SALE_STATUSES = Prisma.sql`('PROCESSING', 'SHIPPED', 'COMPLETED')`;

export interface SalesTotals {
  revenue: Prisma.Decimal;
  ordersCount: number;
}

export interface TopProductRow {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: Prisma.Decimal;
}

export interface SalesDayRow {
  /** `YYYY-MM-DD`. */
  date: string;
  revenue: Prisma.Decimal;
  ordersCount: number;
}

export interface SaleLineRow {
  orderId: string;
  createdAt: Date;
  status: OrderStatus;
  customerEmail: string;
  itemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

/** Where the previous batch of order lines ended: the sort key of its last row. */
export interface SaleLineCursor {
  createdAt: Date;
  orderId: string;
  itemId: string;
}

/**
 * Read-only aggregates over orders. Raw SQL on purpose (grouping, `generate_series`, keyset
 * comparison); every value goes in as a bound parameter. Money columns are cast to a fixed scale
 * and counts to `int`, so the result types are the ones declared here (`COUNT` is a bigint
 * otherwise). All ranges are `[start, end)` instants; the caller turns UTC days into them.
 */
@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async totals(start: Date, end: Date): Promise<SalesTotals> {
    const [row] = await this.prisma.$queryRaw<SalesTotals[]>`
      SELECT COALESCE(SUM(total_amount), 0)::numeric(14, 2) AS "revenue",
             COUNT(*)::int AS "ordersCount"
      FROM orders
      WHERE status IN ${SALE_STATUSES}
        AND created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz`;
    return row;
  }

  /**
   * Best sellers by units, then revenue (both at the prices paid). The product id is the last
   * tie-break, so equal products always come in the same order.
   */
  topProducts(start: Date, end: Date, limit: number): Promise<TopProductRow[]> {
    return this.prisma.$queryRaw<TopProductRow[]>`
      SELECT oi.product_id AS "productId",
             p.name AS "name",
             SUM(oi.quantity)::int AS "quantitySold",
             SUM(oi.quantity * oi.unit_price)::numeric(14, 2) AS "revenue"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.status IN ${SALE_STATUSES}
        AND o.created_at >= ${start}::timestamptz AND o.created_at < ${end}::timestamptz
      GROUP BY oi.product_id, p.name
      ORDER BY SUM(oi.quantity) DESC, SUM(oi.quantity * oi.unit_price) DESC, oi.product_id
      LIMIT ${limit}::int`;
  }

  /**
   * One row per UTC day from `from` to `to`, both included, whether or not anything was sold
   * (the LEFT JOIN keeps empty days). The series runs over plain timestamps and `AT TIME ZONE
   * 'UTC'` turns each into the instant it names, so day boundaries never depend on the session's
   * time zone setting.
   */
  salesByDay(from: string, to: string): Promise<SalesDayRow[]> {
    return this.prisma.$queryRaw<SalesDayRow[]>`
      SELECT to_char(d, 'YYYY-MM-DD') AS "date",
             COALESCE(SUM(o.total_amount), 0)::numeric(14, 2) AS "revenue",
             COUNT(o.id)::int AS "ordersCount"
      FROM generate_series(${from}::timestamp, ${to}::timestamp, interval '1 day') AS d
      LEFT JOIN orders o
        ON o.created_at >= (d AT TIME ZONE 'UTC')
       AND o.created_at < ((d + interval '1 day') AT TIME ZONE 'UTC')
       AND o.status IN ${SALE_STATUSES}
      GROUP BY d
      ORDER BY d`;
  }

  /**
   * The next `limit` order lines of the sales in the range, after `cursor` (or from the start).
   * Keyset pagination: the sort key (order date, order id, line id) is unique, so "everything
   * after the last row seen" is exact however many rows share a timestamp, and the cost of a batch
   * does not grow with its position the way OFFSET does. The date range is served by the
   * `orders (created_at)` index.
   */
  findSaleLines(
    start: Date,
    end: Date,
    cursor: SaleLineCursor | null,
    limit: number,
  ): Promise<SaleLineRow[]> {
    const after = cursor
      ? Prisma.sql`AND (o.created_at, o.id, oi.id) >
          (${cursor.createdAt}::timestamptz, ${cursor.orderId}::uuid, ${cursor.itemId}::uuid)`
      : Prisma.empty;
    return this.prisma.$queryRaw<SaleLineRow[]>`
      SELECT o.id AS "orderId",
             o.created_at AS "createdAt",
             o.status AS "status",
             u.email AS "customerEmail",
             oi.id AS "itemId",
             oi.product_id AS "productId",
             oi.product_name AS "productName",
             oi.quantity AS "quantity",
             oi.unit_price AS "unitPrice",
             (oi.quantity * oi.unit_price)::numeric(14, 2) AS "lineTotal"
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN users u ON u.id = o.user_id
      WHERE o.status IN ${SALE_STATUSES}
        AND o.created_at >= ${start}::timestamptz AND o.created_at < ${end}::timestamptz
        ${after}
      ORDER BY o.created_at, o.id, oi.id
      LIMIT ${limit}::int`;
  }
}
