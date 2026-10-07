import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiError } from '@/shared/api/errors';
import { CheckoutForm } from './checkout-form';

const meta = {
  title: 'Checkout/CheckoutForm',
  component: CheckoutForm,
  args: { onSubmit: () => Promise.resolve() },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CheckoutForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function fillAndPay(canvasElement: HTMLElement, address = '12 Main Street, Springfield') {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByLabelText(/Shipping address/), address);
  await userEvent.click(canvas.getByRole('button', { name: 'Pay (mock)' }));
  return canvas;
}

export const Default: Story = {};

export const ValidationError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fillAndPay(canvasElement, 'Home');
    await expect(
      await canvas.findByText('Shipping address must be at least 10 characters'),
    ).toBeInTheDocument();
  },
};

export const Submitting: Story = {
  args: { onSubmit: () => new Promise<void>(() => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = await fillAndPay(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Pay (mock)' })).toBeDisabled();
  },
};

export const OutOfStock: Story = {
  args: {
    onSubmit: () =>
      Promise.reject(
        new ApiError({
          status: 409,
          code: 'INSUFFICIENT_STOCK',
          message: 'Not enough stock for "Wireless Mouse"',
        }),
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = await fillAndPay(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Not enough stock for "Wireless Mouse". Review your cart and try again.',
    );
  },
};

export const ConnectionLost: Story = {
  args: {
    onSubmit: () =>
      Promise.reject(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = await fillAndPay(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('will not create a duplicate');
  },
};

export const Blocked: Story = { args: { disabled: true } };
