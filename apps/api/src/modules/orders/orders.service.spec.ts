import { Prisma } from '../../generated/prisma/client';
import type { OrderWithItems } from './mappers/to-order-response';
import type { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

function setup(found: OrderWithItems | null) {
  const repo = { findOwn: jest.fn().mockResolvedValue(found) };
  return { service: new OrdersService(repo as unknown as OrdersRepository), repo };
}

describe('OrdersService.getOwn', () => {
  it('looks the order up by id and owner, and maps it', async () => {
    const at = new Date('2026-10-06T12:00:00.000Z');
    const { service, repo } = setup({
      id: 'order-1',
      userId: 'user-1',
      status: 'NEW',
      paymentStatus: 'PENDING',
      paymentRef: null,
      totalAmount: new Prisma.Decimal('5'),
      shippingAddress: '1 Main Street, Springfield',
      idempotencyKey: 'checkout-key-1',
      cancelReason: null,
      createdAt: at,
      updatedAt: at,
      items: [],
    });

    await expect(service.getOwn('user-1', 'order-1')).resolves.toMatchObject({
      id: 'order-1',
      totalAmount: '5.00',
    });
    expect(repo.findOwn).toHaveBeenCalledWith('user-1', 'order-1');
  });

  it('answers 404 ORDER_NOT_FOUND when the customer has no such order (missing or not theirs)', async () => {
    await expect(setup(null).service.getOwn('user-1', 'order-1')).rejects.toMatchObject({
      httpStatus: 404,
      code: 'ORDER_NOT_FOUND',
    });
  });
});
