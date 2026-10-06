import { Prisma } from '../../generated/prisma/client';
import type { AdminOrderQueryDto, OrderQueryDto } from './dto/order-query.dto';
import type {
  AdminOrderSummaryRow,
  OrderSummaryRow,
  OrderWithCustomer,
  OrderWithItems,
} from './mappers/to-order-response';
import type { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const AT = new Date('2026-10-06T12:00:00.000Z');

const stored: OrderWithItems = {
  id: 'order-1',
  userId: 'user-1',
  status: 'NEW',
  paymentStatus: 'PENDING',
  paymentRef: null,
  totalAmount: new Prisma.Decimal('5'),
  shippingAddress: '1 Main Street, Springfield',
  idempotencyKey: 'checkout-key-1',
  cancelReason: null,
  createdAt: AT,
  updatedAt: AT,
  items: [],
};

const summaryRow: OrderSummaryRow = { ...stored, _count: { items: 2 } };
const customer = { id: 'user-1', email: 'ann@example.com', name: 'Ann' };

function setup(overrides: Partial<Record<keyof OrdersRepository, jest.Mock>> = {}) {
  const repo = {
    findOwn: jest.fn(),
    findWithCustomer: jest.fn(),
    findOwnPage: jest.fn(),
    findPage: jest.fn(),
    ...overrides,
  };
  return { service: new OrdersService(repo as unknown as OrdersRepository), repo };
}

// A query as it looks after validation: the defaults (page 1, 20 per page) are filled in.
function ownQuery(query: Partial<OrderQueryDto> = {}): OrderQueryDto {
  return { page: 1, limit: 20, ...query };
}

function adminQuery(query: Partial<AdminOrderQueryDto> = {}): AdminOrderQueryDto {
  return { page: 1, limit: 20, ...query };
}

describe('OrdersService.getOwn', () => {
  it('looks the order up by id and owner, and maps it for the customer', async () => {
    const { service, repo } = setup({ findOwn: jest.fn().mockResolvedValue(stored) });

    await expect(service.getOwn('user-1', 'order-1')).resolves.toMatchObject({
      id: 'order-1',
      totalAmount: '5.00',
      allowedTransitions: ['CANCELLED'],
    });
    expect(repo.findOwn).toHaveBeenCalledWith('user-1', 'order-1');
  });

  it('answers 404 ORDER_NOT_FOUND when the customer has no such order (missing or not theirs)', async () => {
    const { service } = setup({ findOwn: jest.fn().mockResolvedValue(null) });

    await expect(service.getOwn('user-1', 'order-1')).rejects.toMatchObject({
      httpStatus: 404,
      code: 'ORDER_NOT_FOUND',
    });
  });
});

describe('OrdersService.listOwn', () => {
  it("lists the caller's orders with the status filter and the page window, and builds the meta", async () => {
    const { service, repo } = setup({
      findOwnPage: jest.fn().mockResolvedValue({ items: [summaryRow], total: 41 }),
    });

    const page = await service.listOwn('user-1', ownQuery({ page: 3, limit: 10, status: 'NEW' }));

    expect(repo.findOwnPage).toHaveBeenCalledWith('user-1', 'NEW', 20, 10);
    expect(page.meta).toEqual({ page: 3, limit: 10, total: 41, totalPages: 5 });
    expect(page.items).toEqual([
      {
        id: 'order-1',
        status: 'NEW',
        paymentStatus: 'PENDING',
        totalAmount: '5.00',
        itemsCount: 2,
        createdAt: '2026-10-06T12:00:00.000Z',
      },
    ]);
  });
});

describe('OrdersService.listAll', () => {
  it('turns the UTC days into timestamp bounds and passes the other filters on', async () => {
    const { service, repo } = setup({
      findPage: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    });

    await service.listAll(
      adminQuery({
        status: 'SHIPPED',
        from: '2026-10-01',
        to: '2026-10-02',
        customerEmail: 'ann@',
      }),
    );

    expect(repo.findPage).toHaveBeenCalledWith(
      {
        status: 'SHIPPED',
        createdAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lt: new Date('2026-10-03T00:00:00.000Z'),
        },
        customerEmail: 'ann@',
      },
      0,
      20,
    );
  });

  it('applies no date bounds without from and to, and maps the customer', async () => {
    const row: AdminOrderSummaryRow = { ...summaryRow, user: customer };
    const { service, repo } = setup({
      findPage: jest.fn().mockResolvedValue({ items: [row], total: 1 }),
    });

    const page = await service.listAll(adminQuery());

    expect(repo.findPage).toHaveBeenCalledWith(
      { status: undefined, createdAt: undefined, customerEmail: undefined },
      0,
      20,
    );
    expect(page.items[0]).toMatchObject({ id: 'order-1', customer });
  });
});

describe('OrdersService.getForAdmin', () => {
  it('returns any order with its customer and the administrator transitions', async () => {
    const order: OrderWithCustomer = { ...stored, status: 'PROCESSING', user: customer };
    const { service } = setup({ findWithCustomer: jest.fn().mockResolvedValue(order) });

    await expect(service.getForAdmin('order-1')).resolves.toMatchObject({
      id: 'order-1',
      customer,
      allowedTransitions: ['SHIPPED', 'CANCELLED'],
    });
  });

  it('answers 404 ORDER_NOT_FOUND for a missing order', async () => {
    const { service } = setup({ findWithCustomer: jest.fn().mockResolvedValue(null) });

    await expect(service.getForAdmin('order-1')).rejects.toMatchObject({
      httpStatus: 404,
      code: 'ORDER_NOT_FOUND',
    });
  });
});
