import { describe, expect, it } from 'vitest';
import { addDays, inclusiveDayCount, isCalendarDay, toDay } from './days';

describe('isCalendarDay', () => {
  it('accepts real days, leap day included', () => {
    expect(isCalendarDay('2026-10-07')).toBe(true);
    expect(isCalendarDay('2028-02-29')).toBe(true);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-1-5', 'today', ''])(
    'rejects %j',
    (value) => {
      expect(isCalendarDay(value)).toBe(false);
    },
  );
});

describe('toDay', () => {
  it('is the UTC day, whatever the local zone', () => {
    expect(toDay(new Date('2026-10-07T23:59:59.999Z'))).toBe('2026-10-07');
    expect(toDay(new Date('2026-10-08T00:00:00.000Z'))).toBe('2026-10-08');
  });
});

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-10-07', -29)).toBe('2026-09-08');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('inclusiveDayCount', () => {
  it('counts both ends', () => {
    expect(inclusiveDayCount('2026-10-07', '2026-10-07')).toBe(1);
    expect(inclusiveDayCount('2026-09-08', '2026-10-07')).toBe(30);
    expect(inclusiveDayCount('2026-01-01', '2026-12-31')).toBe(365);
    expect(inclusiveDayCount('2028-01-01', '2028-12-31')).toBe(366);
  });
});
