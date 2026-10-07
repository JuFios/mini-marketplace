import type { Meta, StoryObj } from '@storybook/react-vite';
import { ORDER_STATUSES, type OrderSummary } from '@/shared/api/types';
import { OrderListItem } from './order-list-item';

const order: OrderSummary = {
  id: '3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f',
  status: 'PROCESSING',
  paymentStatus: 'PAID',
  totalAmount: '129.48',
  itemsCount: 3,
  createdAt: '2026-10-05T12:30:00.000Z',
};

const meta = {
  title: 'Orders/OrderListItem',
  component: OrderListItem,
  args: { order },
  decorators: [
    (Story) => (
      <ul className="max-w-2xl space-y-2">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof OrderListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleProduct: Story = { args: { order: { ...order, itemsCount: 1 } } };

export const Cancelled: Story = {
  args: { order: { ...order, status: 'CANCELLED', paymentStatus: 'REFUNDED' } },
};

export const EveryStatus: Story = {
  render: () => (
    <>
      {ORDER_STATUSES.map((status) => (
        <OrderListItem key={status} order={{ ...order, status }} />
      ))}
    </>
  ),
};
