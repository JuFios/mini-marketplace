import { createValidationPipe } from '../../../common/pipes/validation.pipe';
import { AddCartItemDto, SetCartItemQuantityDto } from './cart.dto';

type Ctor = new () => object;

async function failures(metatype: Ctor, body: Record<string, unknown>): Promise<string[]> {
  try {
    await createValidationPipe().transform(body, { type: 'body', metatype });
    return [];
  } catch (error) {
    return (error as { details: { field: string }[] }).details.map((d) => d.field);
  }
}

const ID = '3f2b1c1e-7c1a-4b0e-9a54-0d1c5f0a7b11';

describe('AddCartItemDto', () => {
  it.each([1, 50, 99])('accepts a quantity of %i', async (quantity) => {
    expect(await failures(AddCartItemDto, { productId: ID, quantity })).toEqual([]);
  });

  it.each([[0], [-1], [100], [1.5], ['2'], [null], [undefined]])(
    'rejects a quantity of %p',
    async (quantity) => {
      expect(await failures(AddCartItemDto, { productId: ID, quantity })).toEqual(['quantity']);
    },
  );

  it('rejects a product id that is not a UUID, and unknown fields such as a price', async () => {
    expect(await failures(AddCartItemDto, { productId: '42', quantity: 1 })).toEqual(['productId']);
    expect(await failures(AddCartItemDto, { productId: ID, quantity: 1, price: '0.01' })).toEqual([
      'price',
    ]);
  });
});

describe('SetCartItemQuantityDto', () => {
  it('accepts 1-99 and rejects everything else', async () => {
    expect(await failures(SetCartItemQuantityDto, { quantity: 99 })).toEqual([]);
    expect(await failures(SetCartItemQuantityDto, { quantity: 0 })).toEqual(['quantity']);
    expect(await failures(SetCartItemQuantityDto, { quantity: 100 })).toEqual(['quantity']);
    expect(await failures(SetCartItemQuantityDto, {})).toEqual(['quantity']);
  });
});
