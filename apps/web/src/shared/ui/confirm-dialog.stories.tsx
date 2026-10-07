import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfirmDialog } from './confirm-dialog';

const meta = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  args: {
    open: true,
    onClose: () => undefined,
    onConfirm: () => undefined,
    title: 'Archive this product?',
    confirmLabel: 'Archive',
    children: 'It disappears from the shop; you can restore it later.',
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Danger: Story = {};

export const Primary: Story = {
  args: { tone: 'primary', title: 'Mark as shipped?', confirmLabel: 'Mark as shipped' },
};
