import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ApiError } from '@/shared/api/errors';
import { QueryBoundary } from './query-boundary';

const meta = {
  title: 'UI/QueryBoundary',
  component: QueryBoundary<string[]>,
  args: {
    query: { status: 'success', data: ['Mouse', 'Keyboard'], refetch: fn() },
    isEmpty: (items) => items.length === 0,
    children: (items) => (
      <ul className="list-inside list-disc">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ),
  },
} satisfies Meta<typeof QueryBoundary<string[]>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Content: Story = {};
export const Loading: Story = { args: { query: { status: 'pending', refetch: fn() } } };
export const Empty: Story = {
  args: { query: { status: 'success', data: [], refetch: fn() } },
};
export const Failed: Story = {
  args: {
    query: {
      status: 'error',
      refetch: fn(),
      error: new ApiError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: '7f3c9a1e-5b2d-4c8e-9a6f-1d2e3f4a5b6c',
      }),
    },
  },
};
