import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { utcDayBounds } from '../../common/utils/utc-days';
import { AnalyticsRepository, SaleLineCursor, SaleLineRow } from './analytics.repository';
import { csvRow } from './csv';
import { resolveDateRange } from './date-range';
import type { DateRangeQueryDto } from './dto/date-range-query.dto';

export const SALES_REPORT_BATCH_SIZE = 1_000;

export const SALES_REPORT_HEADER = [
  'order_id',
  'order_date',
  'status',
  'customer_email',
  'product_id',
  'product_name',
  'quantity',
  'unit_price',
  'line_total',
] as const;

export interface SalesReport {
  filename: string;
  stream: Readable;
}

const toRecord = (line: SaleLineRow): string =>
  csvRow([
    line.orderId,
    line.createdAt.toISOString(),
    line.status,
    line.customerEmail,
    line.productId,
    line.productName,
    line.quantity,
    line.unitPrice.toFixed(2),
    line.lineTotal.toFixed(2),
  ]);

/** The sales of a range as CSV, one row per order line, produced batch by batch. */
@Injectable()
export class SalesReportService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  /**
   * Validates the range and reads the first batch before returning, so a bad range or a database
   * failure is still an ordinary error response: once the first byte of a download is sent the
   * status can no longer change. The rest is read only as fast as the client takes it, so the
   * memory used is one batch however large the report.
   */
  async open(query: DateRangeQueryDto): Promise<SalesReport> {
    const { from, to } = resolveDateRange(query, new Date());
    const { start, end } = utcDayBounds(from, to);
    const first = await this.analytics.findSaleLines(start, end, null, SALES_REPORT_BATCH_SIZE);

    return {
      filename: `sales-${from}-${to}.csv`,
      stream: Readable.from(this.records(start, end, first), { objectMode: false }),
    };
  }

  private async *records(start: Date, end: Date, first: SaleLineRow[]): AsyncGenerator<string> {
    yield csvRow(SALES_REPORT_HEADER);

    let batch = first;
    while (batch.length > 0) {
      yield batch.map(toRecord).join('');
      // A short batch was the last one.
      if (batch.length < SALES_REPORT_BATCH_SIZE) return;

      const last = batch[batch.length - 1];
      const cursor: SaleLineCursor = {
        createdAt: last.createdAt,
        orderId: last.orderId,
        itemId: last.itemId,
      };
      batch = await this.analytics.findSaleLines(start, end, cursor, SALES_REPORT_BATCH_SIZE);
    }
  }
}
