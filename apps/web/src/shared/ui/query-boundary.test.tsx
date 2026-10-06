import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { QueryBoundary, type BoundaryQuery } from './query-boundary';

function renderBoundary(query: BoundaryQuery<string[]>) {
  return render(
    <QueryBoundary query={query} isEmpty={(items) => items.length === 0} empty={<p>No products</p>}>
      {(items) => <p>{items.join(', ')}</p>}
    </QueryBoundary>,
  );
}

describe('QueryBoundary', () => {
  it('shows a spinner while loading', () => {
    renderBoundary({ status: 'pending', refetch: vi.fn() });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the content', () => {
    renderBoundary({ status: 'success', data: ['Mouse', 'Keyboard'], refetch: vi.fn() });

    expect(screen.getByText('Mouse, Keyboard')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    renderBoundary({ status: 'success', data: [], refetch: vi.fn() });

    expect(screen.getByText('No products')).toBeInTheDocument();
  });

  it('shows the error with its request id, and retries on request', async () => {
    const refetch = vi.fn();
    renderBoundary({
      status: 'error',
      refetch,
      error: new ApiError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'stack',
        requestId: 'req-7',
      }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByText('Reference: req-7')).toBeInTheDocument();
    expect(screen.queryByText('stack')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
