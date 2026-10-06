const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreatedAtRange {
  /** Inclusive lower bound. */
  gte?: Date;
  /** Exclusive upper bound. */
  lt?: Date;
}

/**
 * Turns the inclusive UTC days of a date filter into timestamp bounds: `from` starts at 00:00 UTC
 * of its day, `to` is included whole, so the bound is the start of the following day. A UTC day
 * is always 24 hours, so no calendar arithmetic (and no local time zone) is involved.
 */
export function createdAtRange(from?: string, to?: string): CreatedAtRange | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
    ...(to && { lt: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS) }),
  };
}

/** The calendar day of an instant, in UTC, as `YYYY-MM-DD`. */
export function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** `day` moved by `days` (negative for earlier), still `YYYY-MM-DD`. */
export function addUtcDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS));
}

/** How many days `from` to `to` cover, both included: a single day is 1. */
export function inclusiveDayCount(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS + 1;
}

/** Timestamp bounds of the days `from` to `to`, both included: `[start, end)`, in UTC. */
export function utcDayBounds(from: string, to: string): { start: Date; end: Date } {
  return {
    start: new Date(`${from}T00:00:00.000Z`),
    end: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS),
  };
}
