import { ValidationFailedException } from '../../common/exceptions/app.exception';
import { addUtcDays, inclusiveDayCount, utcDay } from '../../common/utils/utc-days';

export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;

/** Inclusive UTC days, `YYYY-MM-DD`. */
export interface DateRange {
  from: string;
  to: string;
}

/**
 * Fills in what the client left out and checks the result. `to` defaults to today (UTC) and `from`
 * to 29 days before `to`, so the default is the last 30 days including today. The checks run on the
 * resolved range, because a default can break them too (a `from` in the future, say). Both are
 * reported on `to`, the end the client can move.
 */
export function resolveDateRange(query: { from?: string; to?: string }, now: Date): DateRange {
  const to = query.to ?? utcDay(now);
  const from = query.from ?? addUtcDays(to, -(DEFAULT_RANGE_DAYS - 1));

  if (from > to) {
    throw new ValidationFailedException([
      { field: 'to', messages: ['to must not be earlier than from'] },
    ]);
  }
  if (inclusiveDayCount(from, to) > MAX_RANGE_DAYS) {
    throw new ValidationFailedException([
      { field: 'to', messages: [`the range must not exceed ${MAX_RANGE_DAYS} days`] },
    ]);
  }
  return { from, to };
}
