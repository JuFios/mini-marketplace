import { describe, expect, it } from 'vitest';
import {
  hasActiveFilters,
  isDayRangeOrdered,
  parseFilters,
  toApiParams,
  toSearchParams,
} from './filters';

const parse = (query: string) => parseFilters(new URLSearchParams(query));

describe('parseFilters', () => {
  it('reads every filter', () => {
    expect(parse('status=SHIPPED&from=2026-10-01&to=2026-10-07&email=ann&page=2')).toEqual({
      status: 'SHIPPED',
      from: '2026-10-01',
      to: '2026-10-07',
      customerEmail: 'ann',
      page: 2,
    });
  });

  it('accepts either end of the range alone', () => {
    expect(parse('from=2026-10-01')).toMatchObject({ from: '2026-10-01', to: '' });
    expect(parse('to=2026-10-07')).toMatchObject({ from: '', to: '2026-10-07' });
  });

  it('drops days that do not exist and an inverted range (the API would answer 400)', () => {
    expect(parse('from=2026-02-30')).toMatchObject({ from: '' });
    expect(parse('from=yesterday&to=2026-10-07')).toMatchObject({ from: '', to: '2026-10-07' });
    expect(parse('from=2026-10-08&to=2026-10-07')).toMatchObject({ from: '2026-10-08', to: '' });
  });

  it('drops an unknown status and a bad page', () => {
    expect(parse('status=PENDING&page=-1')).toMatchObject({ status: '', page: 1 });
  });

  it('trims the email and caps its length at 254', () => {
    expect(parse('email=%20ann%20').customerEmail).toBe('ann');
    expect(parse(`email=${'a'.repeat(300)}`).customerEmail).toHaveLength(254);
  });
});

describe('isDayRangeOrdered', () => {
  it('allows equal days and open ends', () => {
    expect(isDayRangeOrdered('2026-10-07', '2026-10-07')).toBe(true);
    expect(isDayRangeOrdered('', '2026-10-07')).toBe(true);
    expect(isDayRangeOrdered('2026-10-07', '')).toBe(true);
    expect(isDayRangeOrdered('2026-10-08', '2026-10-07')).toBe(false);
  });
});

describe('toSearchParams / toApiParams', () => {
  it('round-trips and leaves defaults out', () => {
    expect(toSearchParams(parse('')).toString()).toBe('');
    const url = 'status=NEW&from=2026-10-01&to=2026-10-07&email=ann&page=2';
    expect(toSearchParams(parse(url)).toString()).toBe(url);
  });

  it('asks for twenty per page and leaves empty filters out', () => {
    expect(toApiParams(parse('email=ann'))).toEqual({
      page: 1,
      limit: 20,
      status: undefined,
      from: undefined,
      to: undefined,
      customerEmail: 'ann',
    });
  });

  it('knows when anything narrows the list', () => {
    expect(hasActiveFilters(parse('page=3'))).toBe(false);
    expect(hasActiveFilters(parse('from=2026-10-01'))).toBe(true);
  });
});
