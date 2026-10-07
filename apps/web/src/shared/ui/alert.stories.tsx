import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from './alert';

const meta = {
  title: 'UI/Alert',
  component: Alert,
  args: { children: 'Invalid email or password.' },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Error: Story = {};
export const Info: Story = { args: { tone: 'info', children: 'Prices are shown in USD.' } };
export const Success: Story = {
  args: { tone: 'success', children: 'Payment received. We are preparing your order.' },
};
