import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiError } from '@/shared/api/errors';
import { LoginForm } from './login-form';

const meta = {
  title: 'Auth/LoginForm',
  component: LoginForm,
  args: { onSubmit: () => Promise.resolve() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ValidationErrors: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Log in' }));
    await expect(await canvas.findByText('Email is required')).toBeInTheDocument();
    await expect(canvas.getByText('Password is required')).toBeInTheDocument();
  },
};

export const Submitting: Story = {
  args: { onSubmit: () => new Promise<void>(() => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Email'), 'ann@example.com');
    await userEvent.type(canvas.getByLabelText('Password'), 'secret123');
    await userEvent.click(canvas.getByRole('button', { name: 'Log in' }));
    await expect(await canvas.findByRole('button', { name: 'Log in' })).toBeDisabled();
  },
};

export const WrongCredentials: Story = {
  args: {
    onSubmit: () =>
      Promise.reject(
        new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }),
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Email'), 'ann@example.com');
    await userEvent.type(canvas.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(canvas.getByRole('button', { name: 'Log in' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  },
};
