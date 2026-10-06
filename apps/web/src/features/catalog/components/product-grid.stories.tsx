import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { KEYBOARD, MOUSE } from '@/test/fixtures';
import { ProductGrid, ProductGridSkeleton } from './product-grid';

const meta = {
  title: 'Catalog/ProductGrid',
  component: ProductGrid,
  args: {
    products: [
      MOUSE,
      KEYBOARD,
      { ...MOUSE, id: 'p3', name: 'USB-C Hub', stock: 0, inStock: false },
      { ...MOUSE, id: 'p4', name: 'Laptop Stand', imageUrl: null },
    ],
    onAddToCart: fn(),
  },
} satisfies Meta<typeof ProductGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { render: () => <ProductGridSkeleton /> };
