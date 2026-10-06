import type { Meta, StoryObj } from '@storybook/react-vite';
import { Price } from './price';

const meta = {
  title: 'UI/Price',
  component: Price,
  args: { value: '129.99' },
} satisfies Meta<typeof Price>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Thousands: Story = { args: { value: '1299999.50' } };
export const Whole: Story = { args: { value: '5.00' } };
