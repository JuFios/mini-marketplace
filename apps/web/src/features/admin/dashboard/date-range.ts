import { addDays, inclusiveDayCount, isCalendarDay, toDay } from '../days';

export interface DateRange {
  /** `YYYY-MM-DD` (UTC), inclusive. */
  from: string;
  to: string;
}

export const DEFAULT_RANGE_DAYS = 30;
/** The API refuses longer ranges. */
export const MAX_RANGE_DAYS = 366;

/** The last `count` days up to and including today (UTC), which is how the API counts "last 30 days". */
export function lastDays(count: number, now: Date): DateRange {
  const to = toDay(now);
  return { from: addDays(to, -(count - 1)), to };
}

/** Why a range cannot be asked for, or `null` when it can. */
export function getRangeError({ from, to }: DateRange): string | null {
  if (!isCalendarDay(from)) return 'Choose a start date';
  if (!isCalendarDay(to)) return 'Choose an end date';
  if (from > to) return 'The start date must not be after the end date';
  if (inclusiveDayCount(from, to) > MAX_RANGE_DAYS) {
    return `The range cannot be longer than ${MAX_RANGE_DAYS} days`;
  }
  return null;
}
