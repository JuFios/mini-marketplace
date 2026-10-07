// Calendar days as `YYYY-MM-DD` strings, all in UTC: that is what the API's date filters speak.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** A real day of the calendar (`2026-02-30` is not one). */
export function isCalendarDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The UTC day of a moment. */
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, count: number): string {
  return toDay(new Date(Date.parse(`${day}T00:00:00Z`) + count * MS_PER_DAY));
}

/** Days from `from` to `to`, both counted. */
export function inclusiveDayCount(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY) + 1
  );
}
