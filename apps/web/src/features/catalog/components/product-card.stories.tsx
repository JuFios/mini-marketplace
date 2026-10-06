import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { KEYBOARD, MOUSE } from '@/test/fixtures';
import { ProductCard } from './product-card';

const meta = {
  title: 'Catalog/ProductCard',
  component: ProductCard,
  args: { product: MOUSE, onAddToCart: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InStock: Story = {};
export const LowStock: Story = { args: { product: KEYBOARD } };
export const OutOfStock: Story = { args: { product: { ...MOUSE, stock: 0, inStock: false } } };
export const NoImage: Story = { args: { product: { ...MOUSE, imageUrl: null } } };
export const BrokenImage: Story = {
  args: { product: { ...MOUSE, imageUrl: 'https://invalid.example/missing.png' } },
};
export const LongName: Story = {
  args: {
    product: {
      ...MOUSE,
      name: 'Ergonomic Wireless Vertical Mouse with Adjustable DPI, Silent Clicks and Long Battery Life',
      price: '1299999.50',
    },
  },
};
// Administrators cannot shop, so the page passes no handler and the button disappears.
export const WithoutAddToCart: Story = { args: { onAddToCart: undefined } };
