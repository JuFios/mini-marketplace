import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiError } from '@/shared/api/errors';
import { RegisterForm } from './register-form';

const meta = {
  title: 'Auth/RegisterForm',
  component: RegisterForm,
  args: { onSubmit: () => Promise.resolve() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RegisterForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ValidationErrors: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Password'), 'short');
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }));
    await expect(await canvas.findByText('Name is required')).toBeInTheDocument();
    await expect(canvas.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  },
};

export const Submitting: Story = {
  args: { onSubmit: () => new Promise<void>(() => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Name'), 'Ann');
    await userEvent.type(canvas.getByLabelText('Email'), 'ann@example.com');
    await userEvent.type(canvas.getByLabelText('Password'), 'secret123');
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }));
    await expect(await canvas.findByRole('button', { name: 'Create account' })).toBeDisabled();
  },
};

export const EmailTaken: Story = {
  args: {
    onSubmit: () =>
      Promise.reject(
        new ApiError({
          status: 409,
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'Email already registered',
        }),
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Name'), 'Ann');
    await userEvent.type(canvas.getByLabelText('Email'), 'ann@example.com');
    await userEvent.type(canvas.getByLabelText('Password'), 'secret123');
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }));
    await expect(
      await canvas.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
  },
};

export const ServerFieldErrors: Story = {
  args: {
    onSubmit: () =>
      Promise.reject(
        new ApiError({
          status: 400,
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          details: [{ field: 'password', messages: ['password is too common'] }],
        }),
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Name'), 'Ann');
    await userEvent.type(canvas.getByLabelText('Email'), 'ann@example.com');
    await userEvent.type(canvas.getByLabelText('Password'), 'secret123');
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }));
    await expect(await canvas.findByText('password is too common')).toBeInTheDocument();
  },
};
