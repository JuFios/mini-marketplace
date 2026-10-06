import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormField } from './form-field';
import { Input } from './input';

const meta = {
  title: 'UI/FormField',
  component: FormField,
  args: {
    label: 'Email',
    children: (control) => <Input type="email" {...control} />,
  },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Required: Story = { args: { required: true } };
export const WithHint: Story = { args: { hint: 'We will never share your email.' } };
export const WithError: Story = { args: { error: 'Enter a valid email address' } };
