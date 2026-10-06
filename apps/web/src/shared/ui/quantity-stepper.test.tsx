import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './quantity-stepper';

describe('QuantityStepper', () => {
  it('steps by one in either direction', async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={3} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));

    expect(onChange.mock.calls).toEqual([[4], [2]]);
  });

  it('stops at the bounds', () => {
    const { rerender } = render(<QuantityStepper value={1} min={1} max={5} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();

    rerender(<QuantityStepper value={5} min={1} max={5} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
  });

  it('can only decrease when the value is already above the maximum', () => {
    render(<QuantityStepper value={5} max={3} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeEnabled();
  });

  it('is named for assistive technology', () => {
    render(<QuantityStepper value={2} label="Quantity of Mouse" onChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Quantity of Mouse' })).toBeInTheDocument();
  });
});
