// Spreadsheets run a cell that starts with one of these as a formula, so text that merely looks
// like one (a product named "=HYPERLINK(...)") would execute when an administrator opens the file.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * One CSV cell (RFC 4180). Text starting with a formula trigger gets a leading apostrophe, which
 * spreadsheets show as plain text; the cell is quoted when it contains a quote, comma or line
 * break, and quotes inside are doubled. Numbers are written as they are: they are numbers.
 */
export function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);

  const text = FORMULA_TRIGGERS.includes(value.charAt(0)) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One record, terminated by CRLF as RFC 4180 asks. */
export function csvRow(cells: readonly (string | number)[]): string {
  return `${cells.map(csvCell).join(',')}\r\n`;
}
