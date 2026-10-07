import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageMeta, Paginated } from '@/shared/api/types';
import { PagedQueryBoundary } from './paged-query-boundary';

const pageOf = (items: string[], meta: Partial<PageMeta> = {}): Paginated<string> => ({
  items,
  meta: { page: 1, limit: 10, total: items.length, totalPages: 1, ...meta },
});

function renderBoundary(data: Paginated<string>, onFirstPage = vi.fn()) {
  render(
    <PagedQueryBoundary
      query={{ status: 'success', data, refetch: vi.fn() }}
      empty={<p>Nothing matches</p>}
      onFirstPage={onFirstPage}
    >
      {(page) => <p>{page.items.join(', ')}</p>}
    </PagedQueryBoundary>,
  );
  return { onFirstPage };
}

describe('PagedQueryBoundary', () => {
  it('shows the items of the page', () => {
    renderBoundary(pageOf(['Mouse', 'Keyboard']));

    expect(screen.getByText('Mouse, Keyboard')).toBeInTheDocument();
  });

  it('shows the empty state when nothing matches at all', () => {
    renderBoundary(pageOf([], { totalPages: 0 }));

    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
    expect(screen.queryByText(/There is no page/)).not.toBeInTheDocument();
  });

  it('says an empty page of a list that has items does not exist, and offers the first page', async () => {
    const { onFirstPage } = renderBoundary(pageOf([], { page: 40, total: 30, totalPages: 3 }));

    expect(screen.getByRole('heading', { name: 'There is no page 40' })).toBeInTheDocument();
    expect(screen.getByText('This list has 3 pages.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing matches')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Go to the first page' }));
    expect(onFirstPage).toHaveBeenCalledTimes(1);
  });

  it('says "one page" rather than "1 pages"', () => {
    renderBoundary(pageOf([], { page: 2, total: 4, totalPages: 1 }));

    expect(screen.getByText('This list has only one page.')).toBeInTheDocument();
  });
});
