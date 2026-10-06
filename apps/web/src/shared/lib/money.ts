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
