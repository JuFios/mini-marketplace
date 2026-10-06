/**
 * Escapes the LIKE/ILIKE metacharacters (`\`, `%`, `_`) so user input matches literally. Prisma's
 * `contains` wraps the value in `%...%` but does not escape what is inside, so a search for "100%"
 * would otherwise match every name containing "100". PostgreSQL's default escape character is `\`.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (character) => `\\${character}`);
}
