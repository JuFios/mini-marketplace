import { describe, expect, it } from 'vitest';
import { ADMIN_MOUSE, UPLOADED_IMAGE } from '@/test/fixtures';
import { toCreateInput, toFormValues, toUpdateInput } from './payload';
import type { ProductValues } from './schemas';

const values: ProductValues = {
  name: 'Wireless Mouse',
  description: 'A small mouse.',
  price: '19.99',
  categoryId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  stock: '20',
  imageUrl: '',
};

describe('toCreateInput', () => {
  it('sends the stock as a number and the price as the string it is', () => {
    expect(toCreateInput(values)).toEqual({
      name: 'Wireless Mouse',
      description: 'A small mouse.',
      price: '19.99',
      categoryId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      stock: 20,
    });
  });

  it('leaves the image out unless there is one', () => {
    expect(toCreateInput(values)).not.toHaveProperty('imageUrl');
    expect(toCreateInput({ ...values, imageUrl: 'https://x.test/a.png' })).toHaveProperty(
      'imageUrl',
      'https://x.test/a.png',
    );
  });
});

describe('toUpdateInput', () => {
  it('never carries the stock: the API would reject it as an unknown field', () => {
    expect(toUpdateInput(values)).not.toHaveProperty('stock');
  });

  it('sends null to remove the picture', () => {
    expect(toUpdateInput(values).imageUrl).toBeNull();
    expect(toUpdateInput({ ...values, imageUrl: '/uploads/a.png' }).imageUrl).toBe(
      '/uploads/a.png',
    );
  });
});

describe('toFormValues', () => {
  it('turns a product into the form’s text fields', () => {
    expect(toFormValues(ADMIN_MOUSE)).toEqual({
      name: 'Wireless Mouse',
      description: 'A small mouse.\nTwo buttons.',
      price: '19.99',
      categoryId: ADMIN_MOUSE.category.id,
      stock: '20',
      imageUrl: UPLOADED_IMAGE,
    });
  });

  it('shows a product without a picture as an empty address', () => {
    expect(toFormValues({ ...ADMIN_MOUSE, imageUrl: null }).imageUrl).toBe('');
  });
});
