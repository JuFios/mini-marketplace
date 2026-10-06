/** A gap is named by the side of the current page it is on, which also makes it a unique React key. */
export type PageItem = number | 'gap-before' | 'gap-after';

/**
 * Page numbers to show: the first, the last and the current page with its neighbours, with a gap
 * marker where pages are skipped (`1 … 4 5 6 … 20`). A gap of a single page shows that page
 * instead, since a marker would be no shorter.
 */
export function getPageItems(page: number, totalPages: number): PageItem[] {
  const wanted = new Set<number>([1, totalPages]);
  for (let candidate = page - 1; candidate <= page + 1; candidate++) {
    if (candidate >= 1 && candidate <= totalPages) wanted.add(candidate);
  }

  const items: PageItem[] = [];
  let previous = 0;
  for (const current of [...wanted].sort((a, b) => a - b)) {
    if (current - previous === 2) items.push(previous + 1);
    else if (current - previous > 2) items.push(current <= page ? 'gap-before' : 'gap-after');
    items.push(current);
    previous = current;
  }
  return items;
}
