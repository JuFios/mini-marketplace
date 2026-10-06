import { describe, expect, it } from 'vitest';
import { formatMoney, fromCents, toCents } from './money';

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

describe('toCents / fromCents', () => {
  it.each([
    ['19.99', 1999],
    ['5', 500],
    ['5.5', 550],
    ['0.05', 5],
    ['1000000.00', 100000000],
  ])('reads %s as %i cents', (amount, cents) => {
    expect(toCents(amount)).toBe(cents);
  });

  it.each([
    [1999, '19.99'],
    [500, '5.00'],
    [5, '0.05'],
    [0, '0.00'],
  ])('writes %i cents as %s', (cents, amount) => {
    expect(fromCents(cents)).toBe(amount);
  });

  it('rejects what is not an amount', () => {
    expect(() => toCents('1,5')).toThrow();
    expect(() => toCents('-1.00')).toThrow();
    expect(() => toCents('1.999')).toThrow();
  });
});
