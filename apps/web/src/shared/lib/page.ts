/**
 * The highest page the API accepts (its `MAX_PAGE`). A larger page in a URL is clamped to it
 * rather than sent on and refused.
 */
export const MAX_PAGE = 100_000;

/**
 * The 1-based `page` of a list URL that anyone can edit by hand. Anything that is not a whole
 * number of at least 1 means the first page.
 */
export function parsePage(params: URLSearchParams): number {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1;
}
