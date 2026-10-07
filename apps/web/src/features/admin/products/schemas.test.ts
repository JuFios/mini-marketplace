import { describe, expect, it } from 'vitest';
import { EMPTY_PRODUCT, isImageUrl, productSchema, stockAdjustmentSchema } from './schemas';

const VALID = {
  ...EMPTY_PRODUCT,
  name: 'Wireless Mouse',
  price: '19.99',
  categoryId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

/** The message of the first problem on `field`, or `undefined` when the field is fine. */
function problem(input: Record<string, string>, field: string) {
  const result = productSchema.safeParse({ ...VALID, ...input });
  return result.success ? undefined : result.error.issues.find((i) => i.path[0] === field)?.message;
}

describe('productSchema', () => {
  it('accepts a complete product and trims the text fields', () => {
    const result = productSchema.parse({ ...VALID, name: '  Wireless Mouse  ', price: ' 19.99 ' });

    expect(result).toMatchObject({ name: 'Wireless Mouse', price: '19.99' });
  });

  it('requires a name of at most 200 characters', () => {
    expect(problem({ name: '   ' }, 'name')).toBe('Name is required');
    expect(problem({ name: 'x'.repeat(201) }, 'name')).toBe('Name must be at most 200 characters');
    expect(problem({ name: 'x'.repeat(200) }, 'name')).toBeUndefined();
  });

  it('allows an empty description but not one over 5000 characters', () => {
    expect(problem({ description: '' }, 'description')).toBeUndefined();
    expect(problem({ description: 'x'.repeat(5001) }, 'description')).toBe(
      'Description must be at most 5000 characters',
    );
  });

  it.each(['0.01', '19.99', '5', '1000000.00', '1000000'])('accepts the price %s', (price) => {
    expect(problem({ price }, 'price')).toBeUndefined();
  });

  it.each([
    ['', 'Price is required'],
    ['abc', 'Use a price like 19.99'],
    ['19.999', 'Use a price like 19.99'],
    ['-5', 'Use a price like 19.99'],
    ['1,5', 'Use a price like 19.99'],
    ['0', 'Price must be at least 0.01'],
    ['0.00', 'Price must be at least 0.01'],
    ['1000000.01', 'Price must be at most 1000000.00'],
  ])('rejects the price %j', (price, message) => {
    expect(problem({ price }, 'price')).toBe(message);
  });

  it('requires a category', () => {
    expect(problem({ categoryId: '' }, 'categoryId')).toBe('Choose a category');
  });

  it.each(['0', '20', '1000000'])('accepts the stock %s', (stock) => {
    expect(problem({ stock }, 'stock')).toBeUndefined();
  });

  it.each(['', '-1', '2.5', 'ten', '1000001'])('rejects the stock %j', (stock) => {
    expect(problem({ stock }, 'stock')).toBeDefined();
  });

  it('takes no picture, an uploaded one, or a web address, and nothing else', () => {
    expect(problem({ imageUrl: '' }, 'imageUrl')).toBeUndefined();
    expect(
      problem({ imageUrl: '/uploads/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f.webp' }, 'imageUrl'),
    ).toBeUndefined();
    expect(problem({ imageUrl: 'https://images.example.com/a.png' }, 'imageUrl')).toBeUndefined();
    expect(problem({ imageUrl: 'javascript:alert(1)' }, 'imageUrl')).toBe(
      'Use an uploaded image or an https address',
    );
    // The app's Content-Security-Policy would never load it.
    expect(problem({ imageUrl: 'http://images.example.com/a.png' }, 'imageUrl')).toBe(
      'Use an uploaded image or an https address',
    );
    expect(problem({ imageUrl: '/uploads/../etc/passwd' }, 'imageUrl')).toBeDefined();
  });
});

describe('isImageUrl', () => {
  it('rejects an address over 2048 characters', () => {
    expect(isImageUrl(`https://example.com/${'a'.repeat(2030)}`)).toBe(false);
    expect(isImageUrl(`https://example.com/${'a'.repeat(2000)}`)).toBe(true);
  });
});

describe('stockAdjustmentSchema', () => {
  const parse = (currentStock: number, delta: string, reason = '') =>
    stockAdjustmentSchema(currentStock).safeParse({ delta, reason });
  const message = (currentStock: number, delta: string) => {
    const result = parse(currentStock, delta);
    return result.success ? undefined : result.error.issues[0]?.message;
  };

  it('accepts additions and removals, with or without a sign', () => {
    expect(parse(10, '5').success).toBe(true);
    expect(parse(10, '+5').success).toBe(true);
    expect(parse(10, '-3').success).toBe(true);
    expect(parse(10, '-10').success).toBe(true);
  });

  it('refuses zero and anything that is not a whole number', () => {
    expect(message(10, '0')).toBe('The change cannot be 0');
    expect(message(10, '-0')).toBe('The change cannot be 0');
    expect(message(10, '2.5')).toBe('Enter a whole number, like 5 or -3');
    expect(message(10, '')).toBe('Enter a whole number, like 5 or -3');
    expect(message(10, 'a lot')).toBe('Enter a whole number, like 5 or -3');
  });

  it('refuses to take more than there is, naming how much there is', () => {
    expect(message(10, '-11')).toBe('Stock cannot go below 0 (there are 10)');
    expect(message(0, '-1')).toBe('Stock cannot go below 0 (there are 0)');
  });

  it('refuses a change beyond the API limit of 1 000 000', () => {
    expect(parse(0, '1000000').success).toBe(true);
    expect(message(0, '1000001')).toBe('The change is too large');
  });

  it('refuses to take the stock past 1 000 000, naming how much there is', () => {
    expect(parse(999_990, '10').success).toBe(true);
    expect(message(999_990, '11')).toBe('Stock cannot go above 1000000 (there are 999990)');
    expect(message(1_000_000, '+1')).toBe('Stock cannot go above 1000000 (there are 1000000)');
  });

  it('still takes units away when a cancelled order has put the stock above the limit', () => {
    expect(parse(1_000_005, '-1').success).toBe(true);
    expect(message(1_000_005, '1')).toBe('Stock cannot go above 1000000 (there are 1000005)');
  });

  it('caps the reason at 200 characters', () => {
    expect(parse(10, '1', 'x'.repeat(200)).success).toBe(true);
    expect(parse(10, '1', 'x'.repeat(201)).success).toBe(false);
  });
});
