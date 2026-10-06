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
