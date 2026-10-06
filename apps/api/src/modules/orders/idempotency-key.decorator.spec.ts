import { parseIdempotencyKey } from './idempotency-key.decorator';

/** Runs `action`, which must throw, and returns what it threw. */
function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the key to be rejected');
}

describe('parseIdempotencyKey', () => {
  it.each([
    ['8 characters', 'abcd1234'],
    ['64 characters', 'k'.repeat(64)],
    ['a UUID', '3f1c9f0e-6a4b-4f7e-9d2c-8b5a1e0c7d63'],
    ['underscores, dashes and capitals', 'Order_Attempt-01'],
  ])('accepts %s', (_label, key) => {
    expect(parseIdempotencyKey(key)).toBe(key);
  });

  it.each([
    ['a missing header', undefined],
    ['an empty value', ''],
    ['7 characters', 'abc1234'],
    ['65 characters', 'k'.repeat(65)],
    ['spaces', 'my order key'],
    ['the header sent twice (joined by Node)', 'abcd1234, efgh5678'],
    ['non-ASCII letters', 'замовлення-1'],
    ['an array', ['abcd1234']],
  ])('rejects %s with 400 IDEMPOTENCY_KEY_REQUIRED', (_label, value) => {
    expect(thrownBy(() => parseIdempotencyKey(value))).toMatchObject({
      httpStatus: 400,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
  });
});
