import { describe, expect, it } from 'vitest';
import { getRangeError, lastDays } from './date-range';

describe('lastDays', () => {
  it('ends today (UTC) and counts today as one of the days', () => {
    expect(lastDays(30, new Date('2026-10-07T03:00:00Z'))).toEqual({
      from: '2026-09-08',
      to: '2026-10-07',
    });
    expect(lastDays(1, new Date('2026-10-07T23:59:00Z'))).toEqual({
      from: '2026-10-07',
      to: '2026-10-07',
    });
  });
});

describe('getRangeError', () => {
  it('accepts an ordinary range, a single day and the longest allowed range', () => {
    expect(getRangeError({ from: '2026-09-08', to: '2026-10-07' })).toBeNull();
    expect(getRangeError({ from: '2026-10-07', to: '2026-10-07' })).toBeNull();
    expect(getRangeError({ from: '2028-01-01', to: '2028-12-31' })).toBeNull(); // 366 days
  });

  it('asks for a date that is missing or not real', () => {
    expect(getRangeError({ from: '', to: '2026-10-07' })).toBe('Choose a start date');
    expect(getRangeError({ from: '2026-10-01', to: '2026-02-30' })).toBe('Choose an end date');
  });

  it('refuses an inverted range', () => {
    expect(getRangeError({ from: '2026-10-08', to: '2026-10-07' })).toBe(
      'The start date must not be after the end date',
    );
  });

  it('refuses a range over 366 days', () => {
    expect(getRangeError({ from: '2025-10-07', to: '2026-10-08' })).toBe(
      'The range cannot be longer than 366 days',
    );
  });
});
