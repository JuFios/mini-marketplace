import { Prisma } from '../../generated/prisma/client';
import { buildCartResponse, CartLine } from './build-cart-response';

const line = (
  productId: string,
  price: string,
  quantity: number,
  product: Partial<CartLine['product']> = {},
): CartLine => ({
  productId,
  quantity,
  product: {
    name: `Product ${productId}`,
    imageUrl: null,
    price: new Prisma.Decimal(price),
    stock: 100,
    deletedAt: null,
    ...product,
  },
});

describe('buildCartResponse', () => {
  it('is an empty, issue-free cart with a zero subtotal when there are no lines', () => {
    expect(buildCartResponse([])).toEqual({
      items: [],
      totalQuantity: 0,
      subtotal: '0.00',
      hasIssues: false,
    });
  });

  it('computes line totals and the subtotal in exact decimal arithmetic', () => {
    // In floating point 0.1 * 3 + 0.2 * 3 is 0.8999999999999999.
    const cart = buildCartResponse([line('a', '0.10', 3), line('b', '0.20', 3)]);

    expect(cart.items.map((i) => i.lineTotal)).toEqual(['0.30', '0.60']);
    expect(cart.subtotal).toBe('0.90');
  });

  it('keeps cents exact on large quantities and prices', () => {
    const cart = buildCartResponse([line('a', '999999.99', 99)]);

    expect(cart.items[0].lineTotal).toBe('98999999.01');
    expect(cart.subtotal).toBe('98999999.01');
  });

  it('formats every amount with two fraction digits', () => {
    const [item] = buildCartResponse([line('a', '5', 2)]).items;

    expect(item).toMatchObject({ unitPrice: '5.00', lineTotal: '10.00' });
  });

  it('sums the quantity of all lines and keeps the order it was given', () => {
    const cart = buildCartResponse([line('b', '1', 2), line('a', '1', 5)]);

    expect(cart.totalQuantity).toBe(7);
    expect(cart.items.map((i) => i.productId)).toEqual(['b', 'a']);
  });

  describe('availability flags', () => {
    it('marks a line available and within stock as healthy', () => {
      const cart = buildCartResponse([line('a', '1', 5, { stock: 5 })]);

      expect(cart.items[0]).toMatchObject({ isAvailable: true, exceedsStock: false });
      expect(cart.hasIssues).toBe(false);
    });

    it('flags a quantity above stock, and only strictly above', () => {
      const cart = buildCartResponse([
        line('a', '1', 6, { stock: 5 }),
        line('b', '1', 5, { stock: 5 }),
      ]);

      expect(cart.items.map((i) => i.exceedsStock)).toEqual([true, false]);
      expect(cart.hasIssues).toBe(true);
    });

    it('flags an archived product as unavailable', () => {
      const cart = buildCartResponse([line('a', '1', 1, { deletedAt: new Date() })]);

      expect(cart.items[0].isAvailable).toBe(false);
      expect(cart.hasIssues).toBe(true);
    });

    it('flags any quantity of a sold-out product', () => {
      const cart = buildCartResponse([line('a', '1', 1, { stock: 0 })]);

      expect(cart.items[0]).toMatchObject({ exceedsStock: true, stock: 0 });
    });

    it('reports hasIssues when just one of many lines has a problem', () => {
      const cart = buildCartResponse([
        line('a', '1', 1),
        line('b', '1', 1),
        line('c', '1', 9, { stock: 1 }),
      ]);

      expect(cart.hasIssues).toBe(true);
    });
  });
});
