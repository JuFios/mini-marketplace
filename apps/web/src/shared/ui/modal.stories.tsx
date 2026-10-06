import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './button';
import { Modal } from './modal';

const meta = {
  title: 'UI/Modal',
  component: Modal,
  args: { open: false, onClose: () => undefined, title: 'Cancel this order?', children: null },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmation: Story = {
  render: (args) => {
    // The open state belongs to whoever uses the modal, so the story keeps it.
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Cancel order</Button>
        <Modal
          {...args}
          open={open}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Keep order
              </Button>
              <Button variant="danger" onClick={() => setOpen(false)}>
                Cancel order
              </Button>
            </>
          }
        >
          The items will go back into stock and the payment will be refunded.
        </Modal>
      </>
    );
  },
};
