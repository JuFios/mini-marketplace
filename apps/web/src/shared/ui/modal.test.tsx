import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

const dialog = () => screen.getByRole('dialog', { hidden: true });

describe('Modal', () => {
  it('is named by its title and open only when asked', () => {
    const { rerender } = render(
      <Modal open={false} onClose={vi.fn()} title="Cancel order?">
        Body
      </Modal>,
    );
    expect(dialog()).not.toHaveAttribute('open');

    rerender(
      <Modal open onClose={vi.fn()} title="Cancel order?">
        Body
      </Modal>,
    );

    expect(dialog()).toHaveAttribute('open');
    expect(screen.getByRole('dialog', { name: 'Cancel order?' })).toBeInTheDocument();
  });

  it('asks to close when the dialog is dismissed (Escape)', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Cancel order?">
        Body
      </Modal>,
    );

    // The browser fires `close` after Escape.
    fireEvent(dialog(), new Event('close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks to close on a click on the backdrop, but not on the content', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Cancel order?">
        Body
      </Modal>,
    );

    fireEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not report a close that the parent itself asked for', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} title="Cancel order?">
        Body
      </Modal>,
    );

    rerender(
      <Modal open={false} onClose={onClose} title="Cancel order?">
        Body
      </Modal>,
    );

    expect(dialog()).not.toHaveAttribute('open');
    expect(onClose).not.toHaveBeenCalled();
  });
});
