import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './select';

const meta = {
  title: 'UI/Select',
  component: Select,
  args: {
    'aria-label': 'Sort by',
    children: (
      <>
        <option value="newest">Newest</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
      </>
    ),
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Invalid: Story = { args: { invalid: true } };
export const Disabled: Story = { args: { disabled: true } };
