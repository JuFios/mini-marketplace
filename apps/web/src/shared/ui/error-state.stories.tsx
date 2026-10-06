import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ErrorState } from './error-state';

const meta = {
  title: 'UI/ErrorState',
  component: ErrorState,
  args: { message: 'Cannot reach the server. Check your connection and try again.' },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithRetry: Story = { args: { onRetry: fn() } };
export const WithRequestId: Story = {
  args: {
    message: 'Something went wrong. Please try again.',
    requestId: '7f3c9a1e-5b2d-4c8e-9a6f-1d2e3f4a5b6c',
    onRetry: fn(),
  },
};
