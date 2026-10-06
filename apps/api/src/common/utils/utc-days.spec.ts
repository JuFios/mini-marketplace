import { addUtcDays, createdAtRange, inclusiveDayCount, utcDay, utcDayBounds } from './utc-days';

describe('createdAtRange', () => {
  it('has no bounds without a filter', () => {
    expect(createdAtRange()).toBeUndefined();
  });

  it('starts at the beginning of `from` and ends after the whole `to` day, in UTC', () => {
    expect(createdAtRange('2026-10-01', '2026-10-03')).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lt: new Date('2026-10-04T00:00:00.000Z'),
    });
  });

  it('accepts a single bound', () => {
    expect(createdAtRange('2026-10-01')).toEqual({ gte: new Date('2026-10-01T00:00:00.000Z') });
    expect(createdAtRange(undefined, '2026-10-01')).toEqual({
      lt: new Date('2026-10-02T00:00:00.000Z'),
    });
  });

  it('includes a single day when both bounds are equal', () => {
    expect(createdAtRange('2026-10-05', '2026-10-05')).toEqual({
      gte: new Date('2026-10-05T00:00:00.000Z'),
      lt: new Date('2026-10-06T00:00:00.000Z'),
    });
  });

  it('rolls over month, year and leap-day ends', () => {
    expect(createdAtRange(undefined, '2026-12-31')?.lt).toEqual(
      new Date('2027-01-01T00:00:00.000Z'),
    );
    expect(createdAtRange(undefined, '2028-02-28')?.lt).toEqual(
      new Date('2028-02-29T00:00:00.000Z'),
    );
    expect(createdAtRange(undefined, '2028-02-29')?.lt).toEqual(
      new Date('2028-03-01T00:00:00.000Z'),
    );
  });
});

describe('UTC day helpers', () => {
  it('names the UTC day of an instant, whatever the local zone', () => {
    expect(utcDay(new Date('2026-10-06T23:59:59.999Z'))).toBe('2026-10-06');
    expect(utcDay(new Date('2026-10-07T00:00:00.000Z'))).toBe('2026-10-07');
  });

  it('moves days across month, year and leap-day boundaries', () => {
    expect(addUtcDays('2026-10-06', -29)).toBe('2026-09-07');
    expect(addUtcDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addUtcDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addUtcDays('2026-10-06', 0)).toBe('2026-10-06');
  });

  it('counts the days of a range with both ends included', () => {
    expect(inclusiveDayCount('2026-10-06', '2026-10-06')).toBe(1);
    expect(inclusiveDayCount('2026-10-01', '2026-10-30')).toBe(30);
    expect(inclusiveDayCount('2025-10-06', '2026-10-06')).toBe(366);
    expect(inclusiveDayCount('2028-02-28', '2028-03-01')).toBe(3);
  });

  it('gives [start, end) bounds that include the whole last day', () => {
    expect(utcDayBounds('2026-10-01', '2026-10-02')).toEqual({
      start: new Date('2026-10-01T00:00:00.000Z'),
      end: new Date('2026-10-03T00:00:00.000Z'),
    });
  });
});
