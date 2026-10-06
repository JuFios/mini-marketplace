import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { UserMenu } from './user-menu';

const meta = {
  title: 'Auth/UserMenu',
  component: UserMenu,
  args: {
    user: { name: 'Ann Lee', email: 'ann@example.com', role: 'CUSTOMER' },
    onLogout: fn(),
  },
  // The panel opens downwards from the trigger and the header is right-aligned.
  decorators: [
    (Story) => (
      <div className="flex min-h-64 justify-end">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Ann Lee' }));
    await expect(await canvas.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
  },
};

export const Administrator: Story = {
  args: { user: { name: 'Site Admin', email: 'admin@example.com', role: 'ADMIN' } },
  play: Open.play,
};
