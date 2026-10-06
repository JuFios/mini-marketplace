import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from './spinner';

const meta = {
  title: 'UI/Spinner',
  component: Spinner,
  decorators: [
    (Story) => (
      <div className="text-brand-600">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
