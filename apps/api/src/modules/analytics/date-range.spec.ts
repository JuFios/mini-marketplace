import { resolveDateRange } from './date-range';

const NOW = new Date('2026-10-06T15:30:00.000Z');

const failure = (query: { from?: string; to?: string }): unknown => {
  try {
    resolveDateRange(query, NOW);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('resolveDateRange', () => {
  it('defaults to the last 30 days including today, in UTC', () => {
    expect(resolveDateRange({}, NOW)).toEqual({ from: '2026-09-07', to: '2026-10-06' });
  });

  it('takes the day from the UTC clock, not the local one', () => {
    const justAfterMidnight = new Date('2026-10-07T00:00:01.000Z');

    expect(resolveDateRange({}, justAfterMidnight).to).toBe('2026-10-07');
  });

  it('counts 30 days back from `to` when only `to` is given', () => {
    expect(resolveDateRange({ to: '2026-03-31' }, NOW)).toEqual({
      from: '2026-03-02',
      to: '2026-03-31',
    });
  });

  it('runs to today when only `from` is given', () => {
    expect(resolveDateRange({ from: '2026-10-01' }, NOW)).toEqual({
      from: '2026-10-01',
      to: '2026-10-06',
    });
  });

  it('keeps an explicit range, a single day included', () => {
    expect(resolveDateRange({ from: '2026-10-02', to: '2026-10-02' }, NOW)).toEqual({
      from: '2026-10-02',
      to: '2026-10-02',
    });
  });

  it('accepts 366 days and refuses 367', () => {
    expect(resolveDateRange({ from: '2025-10-06', to: '2026-10-06' }, NOW)).toEqual({
      from: '2025-10-06',
      to: '2026-10-06',
    });
    expect(failure({ from: '2025-10-05', to: '2026-10-06' })).toMatchObject({
      httpStatus: 400,
      code: 'VALIDATION_FAILED',
      details: [{ field: 'to', messages: ['the range must not exceed 366 days'] }],
    });
  });

  it('refuses `to` earlier than `from`, also when the end is the default', () => {
    expect(failure({ from: '2026-10-05', to: '2026-10-04' })).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'to', messages: ['to must not be earlier than from'] }],
    });
    expect(failure({ from: '2026-10-07' })).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('refuses a default start that makes the range too long', () => {
    expect(failure({ to: '2026-10-06', from: '2020-01-01' })).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
