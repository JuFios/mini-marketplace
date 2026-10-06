import type { Meta, StoryObj } from '@storybook/react-vite';
import { Thumbnail } from './thumbnail';

const meta = {
  title: 'UI/Thumbnail',
  component: Thumbnail,
  args: { src: null, alt: 'Wireless Mouse', className: 'size-32 rounded-md' },
} satisfies Meta<typeof Thumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoImage: Story = {};
export const BrokenImage: Story = { args: { src: 'https://invalid.example/missing.png' } };
