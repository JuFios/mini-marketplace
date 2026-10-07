import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Cart, CartItem } from '@/shared/api/types';
import { CheckoutSummary } from './checkout-summary';

const mouse: CartItem = {
  productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Wireless Mouse',
  imageUrl: null,
  unitPrice: '19.99',
  quantity: 2,
  lineTotal: '39.98',
  stock: 20,
  isAvailable: true,
  exceedsStock: false,
};

const keyboard: CartItem = {
  productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Mechanical Keyboard with a Very Long Name That Needs To Wrap Onto Two Lines',
  imageUrl: null,
  unitPrice: '89.50',
  quantity: 1,
  lineTotal: '89.50',
  stock: 3,
  isAvailable: true,
  exceedsStock: false,
};

const cart: Cart = {
  items: [mouse, keyboard],
  totalQuantity: 3,
  subtotal: '129.48',
  hasIssues: false,
};

const meta = {
  title: 'Checkout/CheckoutSummary',
  component: CheckoutSummary,
  args: { cart },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CheckoutSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithProblems: Story = {
  args: {
    cart: {
      ...cart,
      items: [
        { ...mouse, isAvailable: false },
        { ...keyboard, quantity: 5, lineTotal: '447.50', exceedsStock: true },
      ],
      hasIssues: true,
    },
  },
};
