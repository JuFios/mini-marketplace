import { Prisma } from '../../../generated/prisma/client';
import {
  AdminOrderSummaryRow,
  OrderSummaryRow,
  OrderWithCustomer,
  OrderWithItems,
  toAdminOrderResponse,
  toAdminOrderSummary,
  toOrderResponse,
  toOrderSummary,
} from './to-order-response';

const order: OrderWithItems = {
  id: 'order-1',
  userId: 'user-1',
  status: 'NEW',
  paymentStatus: 'PENDING',
  paymentRef: 'mock_secret_ref',
  totalAmount: new Prisma.Decimal('0.9'),
  shippingAddress: '1 Main Street, Springfield',
  idempotencyKey: 'checkout-key-1',
  cancelReason: null,
  createdAt: new Date('2026-10-06T12:00:00.000Z'),
  updatedAt: new Date('2026-10-06T12:00:01.000Z'),
  items: [
    {
      id: 'item-1',
      orderId: 'order-1',
      productId: 'product-1',
      productName: 'Cable',
      unitPrice: new Prisma.Decimal('0.1'),
      quantity: 3,
    },
    {
      id: 'item-2',
      orderId: 'order-1',
      productId: 'product-2',
      productName: 'Plug',
      unitPrice: new Prisma.Decimal('0.2'),
      quantity: 3,
    },
  ],
};

const customer = { id: 'user-1', email: 'ann@example.com', name: 'Ann' };

describe('toOrderResponse', () => {
  it('formats money as 2-digit strings and computes exact line totals', () => {
    expect(toOrderResponse(order, 'customer')).toEqual({
      id: 'order-1',
      status: 'NEW',
      paymentStatus: 'PENDING',
      cancelReason: null,
      totalAmount: '0.90',
      shippingAddress: '1 Main Street, Springfield',
      items: [
        {
          productId: 'product-1',
          productName: 'Cable',
          unitPrice: '0.10',
          quantity: 3,
          lineTotal: '0.30',
        },
        {
          productId: 'product-2',
          productName: 'Plug',
          unitPrice: '0.20',
          quantity: 3,
          lineTotal: '0.60',
        },
      ],
      createdAt: '2026-10-06T12:00:00.000Z',
      updatedAt: '2026-10-06T12:00:01.000Z',
      allowedTransitions: ['CANCELLED'],
    });
  });

  it('leaves out the owner, the idempotency key and the payment reference', () => {
    const response = toOrderResponse(order, 'customer');

    expect(response).not.toHaveProperty('userId');
    expect(response).not.toHaveProperty('idempotencyKey');
    expect(response).not.toHaveProperty('paymentRef');
  });

  it('offers the transitions of the actor it is rendered for', () => {
    const processing: OrderWithItems = { ...order, status: 'PROCESSING' };
    const shipped: OrderWithItems = { ...order, status: 'SHIPPED' };

    expect(toOrderResponse(processing, 'customer').allowedTransitions).toEqual(['CANCELLED']);
    expect(toOrderResponse(processing, 'admin').allowedTransitions).toEqual([
      'SHIPPED',
      'CANCELLED',
    ]);
    expect(toOrderResponse(shipped, 'customer').allowedTransitions).toEqual([]);
    expect(toOrderResponse(shipped, 'admin').allowedTransitions).toEqual(['COMPLETED']);
  });
});

describe('toAdminOrderResponse', () => {
  const withCustomer: OrderWithCustomer = {
    ...order,
    status: 'PROCESSING',
    user: { ...customer, passwordHash: 'must-not-leak' } as OrderWithCustomer['user'],
  };

  it("renders the order for an administrator and adds only the customer's id, email and name", () => {
    const response = toAdminOrderResponse(withCustomer);

    expect(response).toMatchObject({
      id: 'order-1',
      status: 'PROCESSING',
      allowedTransitions: ['SHIPPED', 'CANCELLED'],
      customer,
    });
    expect(response).not.toHaveProperty('user');
    expect(response).not.toHaveProperty('paymentRef');
    expect(JSON.stringify(response)).not.toContain('must-not-leak');
  });
});

describe('order summaries', () => {
  const { items, ...columns } = order;
  const row: OrderSummaryRow = { ...columns, _count: { items: items.length } };

  it('carry the totals and the number of lines, but no lines and no address', () => {
    const summary = toOrderSummary(row);

    expect(summary).toEqual({
      id: 'order-1',
      status: 'NEW',
      paymentStatus: 'PENDING',
      totalAmount: '0.90',
      itemsCount: 2,
      createdAt: '2026-10-06T12:00:00.000Z',
    });
  });

  it('add the customer for administrators', () => {
    const adminRow: AdminOrderSummaryRow = { ...row, user: customer };
    const summary = toAdminOrderSummary(adminRow);

    expect(summary).toMatchObject({ id: 'order-1', itemsCount: 2, customer });
    expect(summary).not.toHaveProperty('shippingAddress');
  });
});
