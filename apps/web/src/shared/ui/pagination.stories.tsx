import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Pagination } from './pagination';

const meta = {
  title: 'UI/Pagination',
  component: Pagination,
  args: { page: 1, totalPages: 12, onPageChange: () => undefined },
  render: (args) => {
    const [page, setPage] = useState(args.page);
    return <Pagination {...args} page={page} onPageChange={setPage} />;
  },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstPage: Story = {};
export const MiddlePage: Story = { args: { page: 6 } };
export const LastPage: Story = { args: { page: 12 } };
export const FewPages: Story = { args: { totalPages: 3 } };
// A single page needs no navigation: the component renders nothing.
export const SinglePage: Story = { args: { totalPages: 1 } };
