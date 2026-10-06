import { inLockOrder } from './lock-order';

describe('inLockOrder', () => {
  it('sorts by product id in code-unit order (digits before letters, like uuid bytes)', () => {
    const lines = [
      { productId: 'b0000000-0000-4000-8000-000000000000', quantity: 1 },
      { productId: '10000000-0000-4000-8000-000000000000', quantity: 2 },
      { productId: 'a0000000-0000-4000-8000-000000000000', quantity: 3 },
      { productId: '0f000000-0000-4000-8000-000000000000', quantity: 4 },
    ];

    expect(inLockOrder(lines).map((line) => line.quantity)).toEqual([4, 2, 3, 1]);
  });

  it('returns a sorted copy and leaves the input untouched', () => {
    const lines = [{ productId: 'b' }, { productId: 'a' }];

    const sorted = inLockOrder(lines);

    expect(sorted).toEqual([{ productId: 'a' }, { productId: 'b' }]);
    expect(lines).toEqual([{ productId: 'b' }, { productId: 'a' }]);
  });
});
