import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OrderStatus, Prisma, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import type {
  SalesByDayResponse,
  SummaryResponse,
} from '../src/modules/analytics/dto/analytics.response.dto';
import { createUserWithToken, TestUser } from './helpers/auth-helpers';
import { createTestApp, httpServer } from './helpers/create-test-app';
import { resetDb } from './helpers/reset-db';

// Fixture days are in 2024 so that no default range ("the last 30 days") can ever contain them.
const HEADER =
  'order_id,order_date,status,customer_email,product_id,product_name,quantity,unit_price,line_total';

const pid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const oid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iid = (order: number, line: number) =>
  `20000000-0000-4000-8000-${String(order).padStart(2, '0')}${String(line).padStart(10, '0')}`;

interface Line {
  /** Index of the product: 1 = Alpha, 2 = Bravo, ... */
  product: number;
  quantity: number;
  /** The price paid, which is what analytics must use, not the product's current price. */
  price: string;
  /** Name stored on the line; defaults to the product's name. */
  name?: string;
}

describe('analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ann: TestUser;
  let bob: TestUser;
  let admin: TestUser;

  const api = () => request(httpServer(app));
  const as = (user: TestUser) => ({ Authorization: user.bearer });
  const get = (path: string, user: TestUser = admin) =>
    api().get(`/api/v1/admin/analytics/${path}`).set(as(user));

  const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

  /** An order written straight into the database; its total is the sum of its lines. */
  async function insertOrder(
    n: number,
    user: TestUser,
    at: string,
    status: OrderStatus,
    lines: Line[],
  ): Promise<void> {
    await prisma.order.create({
      data: {
        id: oid(n),
        userId: user.id,
        status,
        totalAmount: lines.reduce(
          (sum, l) => sum.add(new Prisma.Decimal(l.price).mul(l.quantity)),
          new Prisma.Decimal(0),
        ),
        shippingAddress: '221B Baker Street, London NW1 6XE',
        idempotencyKey: `fixture-${n}`,
        createdAt: new Date(at),
        updatedAt: new Date(at),
        items: {
          create: lines.map((l, k) => ({
            id: iid(n, k + 1),
            productId: pid(l.product),
            productName: l.name ?? NAMES[l.product - 1],
            unitPrice: l.price,
            quantity: l.quantity,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await createUserWithToken(app, Role.CUSTOMER, 'ann@example.com');
    bob = await createUserWithToken(app, Role.CUSTOMER, 'bob@example.com');
    admin = await createUserWithToken(app, Role.ADMIN);
    const category = await prisma.category.create({ data: { name: 'Peripherals' } });
    // Current prices differ from every price paid below: analytics must read the order lines.
    await prisma.product.createMany({
      data: NAMES.map((name, i) => ({
        id: pid(i + 1),
        name,
        description: '',
        price: '999.00',
        stock: 5,
        categoryId: category.id,
      })),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * The sales used by the first tests, 28 February to 3 March 2024 (a leap year). Only orders that
   * are PROCESSING, SHIPPED or COMPLETED, created inside the range, count.
   *
   *  #  created (UTC)             status      lines (qty × price paid)                  total
   *  1  02-28 00:00:00.000        COMPLETED   Alpha 2×10.00, Bravo 1×5.50                25.50
   *  2  02-28 23:59:59.999        SHIPPED     Alpha 1×10.00                              10.00
   *  3  03-01 12:00               PROCESSING  Charlie 3×4.00, Bravo 2×5.50               23.00
   *  4  03-01 13:00               CANCELLED   Alpha 50×10.00                    (excluded)
   *  5  03-01 14:00               NEW         Delta 40×7.00                     (excluded)
   *  6  03-03 23:59:59.999        COMPLETED   Echo 3×3.33, Foxtrot 1×100.00, Golf 1×50.00,
   *                                           Hotel 1×100.00                            259.99
   *  7  02-27 23:59:59.999        COMPLETED   Alpha 100×10.00              (before the range)
   *  8  03-04 00:00:00.000        COMPLETED   Alpha 100×10.00               (after the range)
   */
  async function insertSales(): Promise<void> {
    await insertOrder(1, ann, '2024-02-28T00:00:00.000Z', 'COMPLETED', [
      { product: 1, quantity: 2, price: '10.00' },
      { product: 2, quantity: 1, price: '5.50' },
    ]);
    await insertOrder(2, bob, '2024-02-28T23:59:59.999Z', 'SHIPPED', [
      { product: 1, quantity: 1, price: '10.00' },
    ]);
    await insertOrder(3, ann, '2024-03-01T12:00:00.000Z', 'PROCESSING', [
      { product: 3, quantity: 3, price: '4.00' },
      { product: 2, quantity: 2, price: '5.50' },
    ]);
    await insertOrder(4, bob, '2024-03-01T13:00:00.000Z', 'CANCELLED', [
      { product: 1, quantity: 50, price: '10.00' },
    ]);
    await insertOrder(5, ann, '2024-03-01T14:00:00.000Z', 'NEW', [
      { product: 4, quantity: 40, price: '7.00' },
    ]);
    await insertOrder(6, bob, '2024-03-03T23:59:59.999Z', 'COMPLETED', [
      { product: 5, quantity: 3, price: '3.33' },
      { product: 6, quantity: 1, price: '100.00' },
      { product: 7, quantity: 1, price: '50.00' },
      { product: 8, quantity: 1, price: '100.00' },
    ]);
    await insertOrder(7, ann, '2024-02-27T23:59:59.999Z', 'COMPLETED', [
      { product: 1, quantity: 100, price: '10.00' },
    ]);
    await insertOrder(8, ann, '2024-03-04T00:00:00.000Z', 'COMPLETED', [
      { product: 1, quantity: 100, price: '10.00' },
    ]);
  }

  const RANGE = 'from=2024-02-28&to=2024-03-03';

  describe('summary', () => {
    beforeEach(insertSales);

    it('adds up only paid, uncancelled orders created inside the range', async () => {
      const response = await get(`summary?${RANGE}`).expect(200);

      // 25.50 + 10.00 + 23.00 + 259.99 = 318.49 over 4 orders; 318.49 / 4 = 79.6225 → 79.62.
      expect(response.body).toEqual({
        from: '2024-02-28',
        to: '2024-03-03',
        totalRevenue: '318.49',
        ordersCount: 4,
        averageOrderValue: '79.62',
        topProducts: [
          // Units sold: Alpha 2+1, Bravo 1+2, Charlie 3, Echo 3 are tied at 3, so revenue decides.
          { productId: pid(1), name: 'Alpha', quantitySold: 3, revenue: '30.00' },
          { productId: pid(2), name: 'Bravo', quantitySold: 3, revenue: '16.50' },
          { productId: pid(3), name: 'Charlie', quantitySold: 3, revenue: '12.00' },
          { productId: pid(5), name: 'Echo', quantitySold: 3, revenue: '9.99' },
          // Foxtrot and Hotel tie on units (1) and revenue (100.00): the lower id comes first.
          // Golf (50.00) and Hotel are cut off.
          { productId: pid(6), name: 'Foxtrot', quantitySold: 1, revenue: '100.00' },
        ],
      });
    });

    it('treats both end days as whole days', async () => {
      // 28 February only: orders 1 (at 00:00:00.000) and 2 (at 23:59:59.999), not 7 (the day before).
      const first = await get('summary?from=2024-02-28&to=2024-02-28').expect(200);
      expect(first.body).toMatchObject({
        totalRevenue: '35.50',
        ordersCount: 2,
        averageOrderValue: '17.75',
      });

      // 3 March only: order 6 at its last millisecond, not order 8 at midnight after it.
      const last = await get('summary?from=2024-03-03&to=2024-03-03').expect(200);
      expect(last.body).toMatchObject({
        totalRevenue: '259.99',
        ordersCount: 1,
        averageOrderValue: '259.99',
      });
      expect((last.body as SummaryResponse).topProducts.map((p) => p.name)).toEqual([
        'Echo',
        'Foxtrot',
        'Hotel',
        'Golf',
      ]);
    });

    it('reports zeros, not an error, for a range without sales', async () => {
      const response = await get('summary?from=2024-03-02&to=2024-03-02').expect(200);

      expect(response.body).toEqual({
        from: '2024-03-02',
        to: '2024-03-02',
        totalRevenue: '0.00',
        ordersCount: 0,
        averageOrderValue: '0.00',
        topProducts: [],
      });
    });

    it('uses the prices paid, not the products’ current prices or names', async () => {
      await prisma.product.update({
        where: { id: pid(1) },
        data: { name: 'Renamed', price: '1.00' },
      });

      const response = await get('summary?from=2024-02-28&to=2024-02-28').expect(200);

      expect((response.body as SummaryResponse).topProducts[0]).toMatchObject({
        productId: pid(1),
        quantitySold: 3,
        revenue: '30.00',
      });
    });

    it('defaults to the last 30 days including today (UTC)', async () => {
      const before = new Date().toISOString().slice(0, 10);
      const response = await get('summary').expect(200);
      const after = new Date().toISOString().slice(0, 10);

      const body = response.body as SummaryResponse;
      expect([before, after]).toContain(body.to);
      const days = (Date.parse(body.to) - Date.parse(body.from)) / 86_400_000 + 1;
      expect(days).toBe(30);
      expect(body).toMatchObject({ totalRevenue: '0.00', ordersCount: 0 });
    });

    it('accepts a range of 366 days and refuses 367', async () => {
      await get('summary?from=2023-03-04&to=2024-03-03').expect(200); // 366 days, 29 Feb inside
      const response = await get('summary?from=2023-03-03&to=2024-03-03').expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'to', messages: ['the range must not exceed 366 days'] }],
      });
    });
  });

  describe('sales by day', () => {
    beforeEach(insertSales);

    it('returns every day of the range, with zeros for days without sales', async () => {
      const response = await get(`sales-by-day?${RANGE}`).expect(200);

      expect(response.body).toEqual({
        from: '2024-02-28',
        to: '2024-03-03',
        days: [
          { date: '2024-02-28', revenue: '35.50', ordersCount: 2 },
          { date: '2024-02-29', revenue: '0.00', ordersCount: 0 }, // the leap day
          { date: '2024-03-01', revenue: '23.00', ordersCount: 1 },
          { date: '2024-03-02', revenue: '0.00', ordersCount: 0 },
          { date: '2024-03-03', revenue: '259.99', ordersCount: 1 },
        ],
      });
    });

    it('agrees with the summary of the same range', async () => {
      const days = ((await get(`sales-by-day?${RANGE}`)).body as SalesByDayResponse).days;
      const summary = (await get(`summary?${RANGE}`)).body as SummaryResponse;

      const revenue = days.reduce((sum, d) => sum.add(d.revenue), new Prisma.Decimal(0));
      expect(revenue.toFixed(2)).toBe(summary.totalRevenue);
      expect(days.reduce((sum, d) => sum + d.ordersCount, 0)).toBe(summary.ordersCount);
    });

    it('is one entry for a single day, and zero-filled by default', async () => {
      const single = await get('sales-by-day?from=2024-03-02&to=2024-03-02').expect(200);
      expect((single.body as SalesByDayResponse).days).toEqual([
        { date: '2024-03-02', revenue: '0.00', ordersCount: 0 },
      ]);

      const byDefault = (await get('sales-by-day').expect(200)).body as SalesByDayResponse;
      expect(byDefault.days).toHaveLength(30);
      expect(byDefault.days.every((d) => d.revenue === '0.00' && d.ordersCount === 0)).toBe(true);
      expect(byDefault.days.map((d) => d.date)).toEqual(
        [...byDefault.days.map((d) => d.date)].sort(),
      );
    });

    it('returns 366 consecutive days at the limit', async () => {
      const response = await get('sales-by-day?from=2023-03-04&to=2024-03-03').expect(200);

      const days = (response.body as SalesByDayResponse).days;
      expect(days).toHaveLength(366);
      expect(new Set(days.map((d) => d.date)).size).toBe(366);
      // Orders 1, 2, 3 and 6, and order 7 (27 February), which this wider range includes.
      expect(days.map((d) => d.ordersCount).reduce((a, b) => a + b, 0)).toBe(5);
    });
  });

  describe('sales report (CSV)', () => {
    it('has the headers, one row per order line of the counted orders, and exact values', async () => {
      await insertSales();

      const response = await get(`sales-report.csv?${RANGE}`).expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="sales-2024-02-28-2024-03-03.csv"',
      );
      const lines = response.text.split('\r\n');
      expect(lines.pop()).toBe(''); // every record, the last included, ends with CRLF
      expect(lines).toEqual([
        HEADER,
        `${oid(1)},2024-02-28T00:00:00.000Z,COMPLETED,ann@example.com,${pid(1)},Alpha,2,10.00,20.00`,
        `${oid(1)},2024-02-28T00:00:00.000Z,COMPLETED,ann@example.com,${pid(2)},Bravo,1,5.50,5.50`,
        `${oid(2)},2024-02-28T23:59:59.999Z,SHIPPED,bob@example.com,${pid(1)},Alpha,1,10.00,10.00`,
        `${oid(3)},2024-03-01T12:00:00.000Z,PROCESSING,ann@example.com,${pid(3)},Charlie,3,4.00,12.00`,
        `${oid(3)},2024-03-01T12:00:00.000Z,PROCESSING,ann@example.com,${pid(2)},Bravo,2,5.50,11.00`,
        `${oid(6)},2024-03-03T23:59:59.999Z,COMPLETED,bob@example.com,${pid(5)},Echo,3,3.33,9.99`,
        `${oid(6)},2024-03-03T23:59:59.999Z,COMPLETED,bob@example.com,${pid(6)},Foxtrot,1,100.00,100.00`,
        `${oid(6)},2024-03-03T23:59:59.999Z,COMPLETED,bob@example.com,${pid(7)},Golf,1,50.00,50.00`,
        `${oid(6)},2024-03-03T23:59:59.999Z,COMPLETED,bob@example.com,${pid(8)},Hotel,1,100.00,100.00`,
      ]);
    });

    it('is just the header for a range without sales', async () => {
      await insertSales();

      const response = await get('sales-report.csv?from=2024-03-02&to=2024-03-02').expect(200);

      expect(response.text).toBe(`${HEADER}\r\n`);
    });

    it('neutralises formulas and quotes cells that need it, in names and emails', async () => {
      const evil = await createUserWithToken(app, Role.CUSTOMER, '+evil@example.com');
      await insertOrder(1, evil, '2024-06-01T10:00:00.000Z', 'COMPLETED', [
        { product: 1, quantity: 1, price: '1.00', name: '=HYPERLINK("http://evil.example","x")' },
        { product: 2, quantity: 1, price: '2.00', name: 'Cable, 2 m' },
        { product: 3, quantity: 1, price: '3.00', name: 'Say "hi"\nthere' },
        { product: 4, quantity: 1, price: '4.00', name: '@SUM(1)' },
        { product: 5, quantity: 1, price: '5.00', name: '-2+3' },
      ]);

      const response = await get('sales-report.csv?from=2024-06-01&to=2024-06-01').expect(200);

      const prefix = `${oid(1)},2024-06-01T10:00:00.000Z,COMPLETED,'+evil@example.com`;
      expect(response.text).toBe(
        `${HEADER}\r\n` +
          `${prefix},${pid(1)},"'=HYPERLINK(""http://evil.example"",""x"")",1,1.00,1.00\r\n` +
          `${prefix},${pid(2)},"Cable, 2 m",1,2.00,2.00\r\n` +
          `${prefix},${pid(3)},"Say ""hi""\nthere",1,3.00,3.00\r\n` +
          `${prefix},${pid(4)},'@SUM(1),1,4.00,4.00\r\n` +
          `${prefix},${pid(5)},'-2+3,1,5.00,5.00\r\n`,
      );
    });

    it('streams a large report in batches without losing or repeating a line, even among equal timestamps', async () => {
      // 1,201 orders of two lines, all at the same instant: batches of 1,000 rows end inside an
      // order, and every row shares its order date, so only the (order, line) part of the sort key
      // keeps the pages apart.
      const at = new Date('2024-09-01T10:00:00.000Z');
      const orders = Array.from({ length: 1_201 }, (_, i) => ({
        id: randomUUID(),
        key: `big-${i}`,
      }));
      await prisma.order.createMany({
        data: orders.map(({ id, key }) => ({
          id,
          userId: ann.id,
          status: OrderStatus.COMPLETED,
          totalAmount: '3.00',
          shippingAddress: '221B Baker Street, London NW1 6XE',
          idempotencyKey: key,
          createdAt: at,
          updatedAt: at,
        })),
      });
      await prisma.orderItem.createMany({
        data: orders.flatMap(({ id }) =>
          [1, 2].map((product) => ({
            orderId: id,
            productId: pid(product),
            productName: NAMES[product - 1],
            unitPrice: '1.50',
            quantity: 1,
          })),
        ),
      });

      const response = await get('sales-report.csv?from=2024-09-01&to=2024-09-01').expect(200);

      const rows = response.text.split('\r\n').slice(1, -1);
      expect(rows).toHaveLength(2_402);
      const keys = rows.map((row) =>
        row.split(',').slice(0, 1).concat(row.split(',')[4]).join('|'),
      );
      expect(new Set(keys).size).toBe(2_402);
      expect(new Set(rows.map((row) => row.split(',')[0])).size).toBe(1_201);
      // Ordered by order id among the equal dates, each order's two lines together.
      const orderIds = rows.map((row) => row.split(',')[0]);
      expect(orderIds).toEqual([...orderIds].sort());
    });

    it('leaves out orders that are NEW or CANCELLED however many there are', async () => {
      await insertOrder(1, ann, '2024-07-01T10:00:00.000Z', 'NEW', [
        { product: 1, quantity: 1, price: '1.00' },
      ]);
      await insertOrder(2, ann, '2024-07-01T11:00:00.000Z', 'CANCELLED', [
        { product: 1, quantity: 1, price: '1.00' },
      ]);

      const response = await get('sales-report.csv?from=2024-07-01&to=2024-07-01').expect(200);

      expect(response.text).toBe(`${HEADER}\r\n`);
    });
  });

  describe('access and validation', () => {
    const PATHS = ['summary', 'sales-by-day', 'sales-report.csv'];

    it.each(PATHS)('%s is for administrators only', async (path) => {
      await get(path, ann).expect(403);
      await api().get(`/api/v1/admin/analytics/${path}`).expect(401);
    });

    it.each(PATHS)('%s rejects a bad range with 400, as an ordinary JSON error', async (path) => {
      for (const query of [
        'from=2024-02-30',
        'to=soon',
        'from=2024-03-05&to=2024-03-01',
        'from=2020-01-01&to=2024-03-01',
        'from=2024-03-01&extra=1',
        'from=2024-03-01T00:00:00Z',
      ]) {
        const response = await get(`${path}?${query}`).expect(400);
        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
    });

    it('refuses a start date in the future when the end defaults to today', async () => {
      const response = await get('summary?from=2999-01-01').expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'to' }],
      });
    });
  });
});
