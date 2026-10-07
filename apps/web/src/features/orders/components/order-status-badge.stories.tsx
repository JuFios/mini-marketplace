import type { Meta, StoryObj } from '@storybook/react-vite';
import { ORDER_STATUSES } from '@/shared/api/types';
import { OrderStatusBadge } from './order-status-badge';

const meta = {
  title: 'Orders/OrderStatusBadge',
  component: OrderStatusBadge,
  args: { status: 'NEW' },
} satisfies Meta<typeof OrderStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {};

export const Processing: Story = { args: { status: 'PROCESSING' } };

export const Shipped: Story = { args: { status: 'SHIPPED' } };

export const Completed: Story = { args: { status: 'COMPLETED' } };

export const Cancelled: Story = { args: { status: 'CANCELLED' } };

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {ORDER_STATUSES.map((status) => (
        <OrderStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
