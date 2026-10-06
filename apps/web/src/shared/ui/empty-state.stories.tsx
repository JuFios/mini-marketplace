import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { EmptyState } from './empty-state';

const meta = {
  title: 'UI/EmptyState',
  component: EmptyState,
  args: { title: 'Your cart is empty' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};
export const WithDescription: Story = {
  args: { description: 'Browse the catalog and add something you like.' },
};
export const WithAction: Story = {
  args: {
    description: 'Browse the catalog and add something you like.',
    action: <Button>Go shopping</Button>,
  },
};
