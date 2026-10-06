import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { KEYBOARD, MOUSE } from '@/test/fixtures';
import type { Product } from '@/shared/api/types';
import { ProductCard } from './product-card';

function renderCard(product: Product, onAddToCart?: (product: Product) => void) {
  return render(
    <MemoryRouter>
      <ProductCard product={product} {...(onAddToCart && { onAddToCart })} />
    </MemoryRouter>,
  );
}

describe('ProductCard', () => {
  it('shows the name as a link, the category, the price and availability', () => {
    renderCard(MOUSE, vi.fn());

    expect(screen.getByRole('link', { name: 'Wireless Mouse' })).toHaveAttribute(
      'href',
      `/products/${MOUSE.id}`,
    );
    expect(screen.getByText('Accessories')).toBeInTheDocument();
    expect(screen.getByText('$19.99')).toBeInTheDocument();
    expect(screen.getByText('In stock')).toBeInTheDocument();
  });

  it('adds the product when the button is pressed', async () => {
    const onAddToCart = vi.fn();
    renderCard(MOUSE, onAddToCart);

    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(onAddToCart).toHaveBeenCalledWith(MOUSE);
  });

  it('shows the out-of-stock state and cannot be added', async () => {
    const onAddToCart = vi.fn();
    renderCard({ ...MOUSE, stock: 0, inStock: false }, onAddToCart);

    const button = screen.getByRole('button', { name: 'Out of stock' });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(onAddToCart).not.toHaveBeenCalled();
    // The badge repeats it, so it is not conveyed by the button alone.
    expect(screen.getAllByText('Out of stock')).toHaveLength(2);
  });

  it('warns when stock is running low', () => {
    renderCard(KEYBOARD, vi.fn());

    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled();
  });

  it('has no button where adding is not offered', () => {
    renderCard(MOUSE);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('falls back to a placeholder without an image', () => {
    renderCard(KEYBOARD);

    // The picture sits in a pointer-only link that is hidden from assistive technology.
    expect(
      screen.getByRole('img', { name: 'Mechanical Keyboard (no image)', hidden: true }),
    ).toBeInTheDocument();
  });
});
