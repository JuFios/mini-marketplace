import { Prisma } from '../../../generated/prisma/client';
import { OrderWithItems, toOrderResponse } from './to-order-response';

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

describe('toOrderResponse', () => {
  it('formats money as 2-digit strings and computes exact line totals', () => {
    expect(toOrderResponse(order)).toEqual({
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
    });
  });

  it('leaves out the owner, the idempotency key and the payment reference', () => {
    const response = toOrderResponse(order);

    expect(response).not.toHaveProperty('userId');
    expect(response).not.toHaveProperty('idempotencyKey');
    expect(response).not.toHaveProperty('paymentRef');
  });
});
