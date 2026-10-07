import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { PagedQueryBoundary } from './paged-query-boundary';

const meta = {
  title: 'UI/PagedQueryBoundary',
  component: PagedQueryBoundary<string>,
  args: {
    query: {
      status: 'success',
      data: { items: ['Mouse', 'Keyboard'], meta: { page: 1, limit: 2, total: 6, totalPages: 3 } },
      refetch: fn(),
    },
    onFirstPage: fn(),
    children: (data) => (
      <ul className="list-inside list-disc">
        {data.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ),
  },
} satisfies Meta<typeof PagedQueryBoundary<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Content: Story = {};
export const NothingMatches: Story = {
  args: {
    query: {
      status: 'success',
      data: { items: [], meta: { page: 1, limit: 2, total: 0, totalPages: 0 } },
      refetch: fn(),
    },
  },
};
/** An old link to page 40 of a list that now has three pages. */
export const PastTheLastPage: Story = {
  args: {
    query: {
      status: 'success',
      data: { items: [], meta: { page: 40, limit: 2, total: 6, totalPages: 3 } },
      refetch: fn(),
    },
  },
};
