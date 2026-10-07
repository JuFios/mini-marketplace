const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/** An API timestamp (ISO 8601) in the viewer's time zone, e.g. `Oct 5, 2026, 3:04 PM`. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  // A malformed value is shown as received: a visible bug beats a crashed page.
  return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}
