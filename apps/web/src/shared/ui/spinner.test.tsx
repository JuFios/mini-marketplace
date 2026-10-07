import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './spinner';

// jsdom does no layout, so what can be checked is the box type that makes centring possible:
// `mx-auto` centres a block-level box and does nothing to an inline one.
describe('Spinner', () => {
  it('is a block-level box as wide as its content, so `mx-auto` can centre it', () => {
    render(<Spinner className="mx-auto" />);

    const { classList } = screen.getByRole('status');

    expect(classList).toContain('flex');
    expect(classList).toContain('w-fit');
    expect(classList).not.toContain('inline-flex');
    expect(classList).toContain('mx-auto');
  });

  it('announces itself, unless it is only decoration inside something that already says so', () => {
    const { rerender } = render(<Spinner label="Loading orders" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading orders');

    rerender(<Spinner decorative />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
