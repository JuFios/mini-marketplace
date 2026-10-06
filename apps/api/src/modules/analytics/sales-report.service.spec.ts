import { Readable } from 'node:stream';
import { Prisma } from '../../generated/prisma/client';
import type { AnalyticsRepository, SaleLineRow } from './analytics.repository';
import {
  SALES_REPORT_BATCH_SIZE,
  SALES_REPORT_HEADER,
  SalesReportService,
} from './sales-report.service';

const AT = new Date('2026-10-01T10:00:00.000Z');

const line = (n: number, overrides: Partial<SaleLineRow> = {}): SaleLineRow => ({
  orderId: `order-${n}`,
  createdAt: AT,
  status: 'COMPLETED',
  customerEmail: 'ann@example.com',
  itemId: `item-${n}`,
  productId: `product-${n}`,
  productName: `Product ${n}`,
  quantity: 2,
  unitPrice: new Prisma.Decimal('1.5'),
  lineTotal: new Prisma.Decimal('3'),
  ...overrides,
});

const lines = (count: number, from = 0): SaleLineRow[] =>
  Array.from({ length: count }, (_, i) => line(from + i));

async function read(stream: Readable): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += String(chunk);
  return text;
}

const open = (service: SalesReportService) =>
  service.open({ from: '2026-10-01', to: '2026-10-05' });

describe('SalesReportService', () => {
  it('writes the header, then one CRLF-terminated record per order line', async () => {
    const find = jest.fn().mockResolvedValue([line(1), line(2)]);
    const service = new SalesReportService({
      findSaleLines: find,
    } as unknown as AnalyticsRepository);

    const report = await open(service);
    const csv = await read(report.stream);

    expect(report.filename).toBe('sales-2026-10-01-2026-10-05.csv');
    expect(csv).toBe(
      `${SALES_REPORT_HEADER.join(',')}\r\n` +
        'order-1,2026-10-01T10:00:00.000Z,COMPLETED,ann@example.com,product-1,Product 1,2,1.50,3.00\r\n' +
        'order-2,2026-10-01T10:00:00.000Z,COMPLETED,ann@example.com,product-2,Product 2,2,1.50,3.00\r\n',
    );
  });

  it('has the nine documented columns', () => {
    expect(SALES_REPORT_HEADER).toEqual([
      'order_id',
      'order_date',
      'status',
      'customer_email',
      'product_id',
      'product_name',
      'quantity',
      'unit_price',
      'line_total',
    ]);
  });

  it('is just the header when nothing was sold', async () => {
    const service = new SalesReportService({
      findSaleLines: jest.fn().mockResolvedValue([]),
    } as unknown as AnalyticsRepository);

    expect(await read((await open(service)).stream)).toBe(`${SALES_REPORT_HEADER.join(',')}\r\n`);
  });

  it('neutralises formulas and quotes awkward text in names and emails', async () => {
    const find = jest.fn().mockResolvedValue([
      line(1, {
        productName: '=HYPERLINK("http://evil.example","click")',
        customerEmail: '+evil@example.com',
      }),
      line(2, { productName: 'Cable, 2 m\n"premium"' }),
    ]);
    const service = new SalesReportService({
      findSaleLines: find,
    } as unknown as AnalyticsRepository);

    const csv = await read((await open(service)).stream);

    expect(csv).toContain(`,'+evil@example.com,`);
    expect(csv).toContain(`,"'=HYPERLINK(""http://evil.example"",""click"")",`);
    expect(csv).toContain(',"Cable, 2 m\n""premium""",');
  });

  it('reads the first batch before it returns, so a failure is still an ordinary error', async () => {
    const find = jest.fn().mockRejectedValue(new Error('database unreachable'));
    const service = new SalesReportService({
      findSaleLines: find,
    } as unknown as AnalyticsRepository);

    await expect(open(service)).rejects.toThrow('database unreachable');
  });

  it('refuses an invalid range without querying', async () => {
    const find = jest.fn();
    const service = new SalesReportService({
      findSaleLines: find,
    } as unknown as AnalyticsRepository);

    await expect(service.open({ from: '2026-10-05', to: '2026-10-01' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(find).not.toHaveBeenCalled();
  });

  describe('batching', () => {
    it('continues after the last row of a full batch and stops at the first short one', async () => {
      const find = jest
        .fn()
        .mockResolvedValueOnce(lines(SALES_REPORT_BATCH_SIZE))
        .mockResolvedValueOnce(lines(SALES_REPORT_BATCH_SIZE, 1_000))
        .mockResolvedValueOnce(lines(5, 2_000));
      const service = new SalesReportService({
        findSaleLines: find,
      } as unknown as AnalyticsRepository);

      const csv = await read((await open(service)).stream);

      expect(csv.split('\r\n')).toHaveLength(1 + 2_005 + 1); // header, rows, trailing empty
      expect(find).toHaveBeenCalledTimes(3);
      const start = new Date('2026-10-01T00:00:00.000Z');
      const end = new Date('2026-10-06T00:00:00.000Z');
      expect(find).toHaveBeenNthCalledWith(1, start, end, null, SALES_REPORT_BATCH_SIZE);
      expect(find).toHaveBeenNthCalledWith(
        2,
        start,
        end,
        { createdAt: AT, orderId: 'order-999', itemId: 'item-999' },
        SALES_REPORT_BATCH_SIZE,
      );
      expect(find).toHaveBeenNthCalledWith(
        3,
        start,
        end,
        { createdAt: AT, orderId: 'order-1999', itemId: 'item-1999' },
        SALES_REPORT_BATCH_SIZE,
      );
    });

    it('asks once more after an exactly full last batch, and ends on the empty answer', async () => {
      const find = jest
        .fn()
        .mockResolvedValueOnce(lines(SALES_REPORT_BATCH_SIZE))
        .mockResolvedValueOnce([]);
      const service = new SalesReportService({
        findSaleLines: find,
      } as unknown as AnalyticsRepository);

      const csv = await read((await open(service)).stream);

      expect(csv.split('\r\n')).toHaveLength(1 + SALES_REPORT_BATCH_SIZE + 1);
      expect(find).toHaveBeenCalledTimes(2);
    });

    it('reads only a little ahead of a slow client, never the whole report', async () => {
      // An endless supply of full batches: a stream that read eagerly would never stop asking.
      const find = jest
        .fn()
        .mockImplementation(() => Promise.resolve(lines(SALES_REPORT_BATCH_SIZE)));
      const service = new SalesReportService({
        findSaleLines: find,
      } as unknown as AnalyticsRepository);

      const { stream } = await open(service);
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next(); // header
      await iterator.next(); // first batch
      await new Promise((resolve) => setImmediate(resolve));

      // The batch of `open`, plus at most the one the stream buffers while the client reads.
      expect(find.mock.calls.length).toBeLessThanOrEqual(3);
      stream.destroy();
    });
  });
});
