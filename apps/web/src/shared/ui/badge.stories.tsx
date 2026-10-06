import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { children: 'In stock' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Info: Story = { args: { tone: 'info', children: 'Processing' } };
export const Success: Story = { args: { tone: 'success', children: 'Paid' } };
export const Warning: Story = { args: { tone: 'warning', children: 'Only 2 left' } };
export const Danger: Story = { args: { tone: 'danger', children: 'Out of stock' } };
