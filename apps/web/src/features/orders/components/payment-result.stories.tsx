import type { Meta, StoryObj } from '@storybook/react-vite';
import { PaymentResult } from './payment-result';

const meta = {
  title: 'Orders/PaymentResult',
  component: PaymentResult,
  args: { order: { status: 'NEW', paymentStatus: 'PENDING', cancelReason: null } },
} satisfies Meta<typeof PaymentResult>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WaitingForPayment: Story = {};

export const TimedOut: Story = {
  args: { pollingTimedOut: true, onRefresh: () => undefined },
};

export const Paid: Story = {
  args: { order: { status: 'PROCESSING', paymentStatus: 'PAID', cancelReason: null } },
};

export const Shipped: Story = {
  args: { order: { status: 'SHIPPED', paymentStatus: 'PAID', cancelReason: null } },
};

export const Completed: Story = {
  args: { order: { status: 'COMPLETED', paymentStatus: 'PAID', cancelReason: null } },
};

export const PaymentDeclined: Story = {
  args: {
    order: { status: 'CANCELLED', paymentStatus: 'FAILED', cancelReason: 'PAYMENT_FAILED' },
  },
};

export const CancelledBeforePayment: Story = {
  args: {
    order: { status: 'CANCELLED', paymentStatus: 'VOIDED', cancelReason: 'CUSTOMER_REQUEST' },
  },
};

export const CancelledAndRefunded: Story = {
  args: {
    order: { status: 'CANCELLED', paymentStatus: 'REFUNDED', cancelReason: 'CUSTOMER_REQUEST' },
  },
};

export const CancelledByTheShop: Story = {
  args: {
    order: { status: 'CANCELLED', paymentStatus: 'REFUNDED', cancelReason: 'ADMIN_ACTION' },
  },
};
