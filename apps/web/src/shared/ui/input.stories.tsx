import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input';

const meta = {
  title: 'UI/Input',
  component: Input,
  args: { placeholder: 'you@example.com', 'aria-label': 'Email' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: 'ann@example.com' } };
export const Invalid: Story = { args: { invalid: true, defaultValue: 'not-an-email' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'ann@example.com' } };
