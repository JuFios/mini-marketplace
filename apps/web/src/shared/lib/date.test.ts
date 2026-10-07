import { describe, expect, it } from 'vitest';
import { formatDateTime } from './date';

describe('formatDateTime', () => {
  it('writes the date out in words', () => {
    // Midday UTC is the same calendar year (and month) in every time zone.
    expect(formatDateTime('2026-10-05T12:00:00.000Z')).toMatch(/Oct \d{1,2}, 2026, \d{1,2}:\d{2}/);
  });

  it('shows a malformed timestamp as received', () => {
    expect(formatDateTime('yesterday')).toBe('yesterday');
  });
});
