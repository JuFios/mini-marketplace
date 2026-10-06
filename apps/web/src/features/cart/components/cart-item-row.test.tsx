import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { CartItem } from '@/shared/api/types';
import { cartItem, KEYBOARD, MOUSE } from '@/test/fixtures';
import { CartItemRow } from './cart-item-row';

function renderRow(item: CartItem) {
  const onQuantityChange = vi.fn();
  const onRemove = vi.fn();
  render(
    <MemoryRouter>
      <ul>
        <CartItemRow item={item} onQuantityChange={onQuantityChange} onRemove={onRemove} />
      </ul>
    </MemoryRouter>,
  );
  return { onQuantityChange, onRemove };
}

describe('CartItemRow', () => {
  it('shows the line and changes the quantity one step at a time', async () => {
    const { onQuantityChange } = renderRow(cartItem(MOUSE, 2));

    expect(screen.getByText('$39.98')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));

    expect(onQuantityChange.mock.calls).toEqual([[3], [1]]);
  });

  it('cannot go below one; removing is a separate action', async () => {
    const { onRemove } = renderRow(cartItem(MOUSE, 1));

    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Wireless Mouse' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('cannot go above the stock', () => {
    renderRow(cartItem(KEYBOARD, 3));

    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
  });

  it('explains a quantity above stock and still lets it be reduced', async () => {
    const { onQuantityChange } = renderRow(cartItem(KEYBOARD, 5));

    expect(screen.getByText('Only 3 in stock. Reduce the quantity.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));

    expect(onQuantityChange).toHaveBeenCalledWith(4);
  });

  it('says so when the product has run out', () => {
    renderRow(cartItem({ ...KEYBOARD, stock: 0 }, 1));

    expect(screen.getByText('Out of stock. Remove it to continue.')).toBeInTheDocument();
  });

  it('shows an unavailable product as such: no link, no stepper, still removable', async () => {
    const { onRemove } = renderRow(cartItem(MOUSE, 1, { isAvailable: false }));

    expect(screen.getByText(/no longer available/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Wireless Mouse' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
