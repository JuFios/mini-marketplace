import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { cartItem, KEYBOARD, MOUSE } from '@/test/fixtures';
import { CartItemRow } from './cart-item-row';

const meta = {
  title: 'Cart/CartItemRow',
  component: CartItemRow,
  args: { item: cartItem(MOUSE, 2), onQuantityChange: fn(), onRemove: fn() },
  // Rows are list items; the list gives them their semantics and the card its frame.
  decorators: [
    (Story) => (
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-4">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof CartItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {};
export const NoImage: Story = { args: { item: cartItem(KEYBOARD, 1) } };
export const AtStockLimit: Story = { args: { item: cartItem(KEYBOARD, 3) } };
export const ExceedsStock: Story = { args: { item: cartItem(KEYBOARD, 5) } };
export const OutOfStock: Story = { args: { item: cartItem({ ...KEYBOARD, stock: 0 }, 1) } };
export const Unavailable: Story = { args: { item: cartItem(MOUSE, 1, { isAvailable: false }) } };
export const LongName: Story = {
  args: {
    item: cartItem(
      {
        ...MOUSE,
        name: 'Ergonomic Wireless Vertical Mouse with Adjustable DPI, Silent Clicks and Long Battery Life',
      },
      1,
    ),
  },
};
