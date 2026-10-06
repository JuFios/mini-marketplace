import { describe, expect, it } from 'vitest';
import { cart, cartItem, EMPTY_CART, KEYBOARD, MOUSE } from '@/test/fixtures';
import { addItem, emptyCart, removeItem, setItemQuantity } from './optimistic';

// Figures are worked out by hand: 19.99 × 3 = 59.97; 89.50 × 1 = 89.50; 59.97 + 89.50 = 149.47.
const twoLines = cart([cartItem(MOUSE, 3), cartItem(KEYBOARD, 1)], { subtotal: '149.47' });

describe('addItem', () => {
  it('adds to the quantity of a line already in the cart', () => {
    const next = addItem(twoLines, MOUSE, 2);

    expect(next.items[0]).toMatchObject({ productId: MOUSE.id, quantity: 5, lineTotal: '99.95' });
    expect(next.totalQuantity).toBe(6);
    expect(next.subtotal).toBe('189.45');
  });

  it('appends a new line built from the product', () => {
    const next = addItem(EMPTY_CART, KEYBOARD, 2);

    expect(next.items).toEqual([
      {
        productId: KEYBOARD.id,
        name: 'Mechanical Keyboard',
        imageUrl: null,
        unitPrice: '89.50',
        quantity: 2,
        lineTotal: '179.00',
        stock: 3,
        isAvailable: true,
        exceedsStock: false,
      },
    ]);
    expect(next.subtotal).toBe('179.00');
  });

  it('flags a line that goes above stock', () => {
    const next = addItem(twoLines, KEYBOARD, 3);

    expect(next.items[1]).toMatchObject({ quantity: 4, exceedsStock: true });
    expect(next.hasIssues).toBe(true);
  });

  it('does not touch the cart it was given', () => {
    addItem(twoLines, MOUSE, 2);

    expect(twoLines.items[0]?.quantity).toBe(3);
  });
});

describe('setItemQuantity', () => {
  it('sets the quantity and recomputes the line and the totals', () => {
    const next = setItemQuantity(twoLines, MOUSE.id, 1);

    expect(next.items[0]).toMatchObject({ quantity: 1, lineTotal: '19.99' });
    expect(next.totalQuantity).toBe(2);
    expect(next.subtotal).toBe('109.49');
  });

  it('clears the stock flag when the quantity comes back under stock', () => {
    const over = cart([cartItem(KEYBOARD, 5)], { subtotal: '447.50' });
    expect(over.hasIssues).toBe(true);

    const next = setItemQuantity(over, KEYBOARD.id, 3);

    expect(next.hasIssues).toBe(false);
  });
});

describe('removeItem / emptyCart', () => {
  it('drops the line', () => {
    const next = removeItem(twoLines, MOUSE.id);

    expect(next.items.map((item) => item.productId)).toEqual([KEYBOARD.id]);
    expect(next.subtotal).toBe('89.50');
  });

  it('keeps issues of the lines that stay', () => {
    const gone = cart([cartItem(MOUSE, 1), cartItem(KEYBOARD, 1, { isAvailable: false })], {
      subtotal: '109.49',
    });

    expect(removeItem(gone, MOUSE.id).hasIssues).toBe(true);
    expect(removeItem(gone, KEYBOARD.id).hasIssues).toBe(false);
  });

  it('empties the cart', () => {
    expect(emptyCart()).toEqual(EMPTY_CART);
  });
});
