import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it.each([
    ['129.99', '$129.99'],
    ['5', '$5.00'],
    ['0.10', '$0.10'],
    ['1299999.50', '$1,299,999.50'],
  ])('formats %s as %s', (amount, expected) => {
    expect(formatMoney(amount)).toBe(expected);
  });

  it('keeps cents that a float cannot hold', () => {
    // 9007199254740993 is not representable as a JS number; the string must not go through one.
    expect(formatMoney('9007199254740993.01')).toBe('$9,007,199,254,740,993.01');
  });

  it('shows a malformed amount as received', () => {
    expect(formatMoney('12,5')).toBe('12,5');
  });
});
