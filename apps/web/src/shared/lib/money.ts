const DECIMAL = /^-?\d+(\.\d+)?$/;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Formats a money amount as the API sends it: a decimal string such as `"129.99"`. The string is
 * handed to `Intl` as is (never through `Number`), so no precision is lost on the way.
 */
export function formatMoney(amount: string): string {
  // A malformed amount is shown as received: a visible bug beats a crashed page.
  if (!DECIMAL.test(amount)) return amount;
  // The pattern above is exactly what `Intl.NumberFormat` accepts as a numeric string.
  return usd.format(amount as `${number}`);
}

const AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * An API amount as a whole number of cents, for the sums an optimistic update shows before the
 * server has answered. Integers are exact where decimal fractions of a float are not.
 */
export function toCents(amount: string): number {
  const match = AMOUNT.exec(amount);
  if (!match) throw new Error(`Not a money amount: "${amount}"`);
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** The inverse of `toCents`, as the two-digit decimal string the API uses. */
export function fromCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
