import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ACCESSORIES } from '@/test/fixtures';
import { DEFAULT_FILTERS, type CatalogFilters } from '../filters';
import { FiltersBar } from './filters-bar';

function setup(filters: CatalogFilters = DEFAULT_FILTERS, isFiltered = false) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(
    <FiltersBar
      filters={filters}
      categories={[ACCESSORIES]}
      onChange={onChange}
      onReset={onReset}
      isFiltered={isFiltered}
    />,
  );
  return { onChange, onReset, user };
}

// Real timers: React Testing Library's async helpers do not cooperate with Vitest's fake ones.
// The debounce is 300 ms; this waits comfortably past it.
const pastDebounce = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });

describe('FiltersBar', () => {
  it('applies the search text only after typing pauses', async () => {
    const { onChange, user } = setup();

    await user.type(screen.getByLabelText('Search'), 'mouse');
    expect(onChange).not.toHaveBeenCalled();

    await pastDebounce();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ search: 'mouse' });
  });

  it('starts from the filters in the URL and does not re-apply them', async () => {
    const { onChange } = setup({ ...DEFAULT_FILTERS, search: 'mouse', minPrice: '5' });

    await pastDebounce();

    expect(screen.getByLabelText('Search')).toHaveValue('mouse');
    expect(screen.getByLabelText('Min price')).toHaveValue('5');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies category and sort at once', async () => {
    const { onChange, user } = setup();

    await user.selectOptions(screen.getByLabelText('Category'), 'Accessories');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'Price: high to low');

    expect(onChange).toHaveBeenNthCalledWith(1, { categoryId: ACCESSORIES.id });
    expect(onChange).toHaveBeenNthCalledWith(2, { sort: 'price_desc' });
  });

  it('applies a valid price range after a pause', async () => {
    const { onChange, user } = setup();

    await user.type(screen.getByLabelText('Min price'), '5');
    await user.type(screen.getByLabelText('Max price'), '20.50');
    await pastDebounce();

    expect(onChange).toHaveBeenLastCalledWith({ minPrice: '5', maxPrice: '20.50' });
  });

  it('shows an error for a malformed price and does not apply it', async () => {
    const { onChange, user } = setup();

    await user.type(screen.getByLabelText('Min price'), '1.999');
    await pastDebounce();

    expect(screen.getByText('Use a price like 19.99')).toBeInTheDocument();
    expect(screen.getByLabelText('Min price')).toBeInvalid();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an error for an inverted range and does not apply it', async () => {
    const { onChange, user } = setup();

    await user.type(screen.getByLabelText('Min price'), '50');
    await user.type(screen.getByLabelText('Max price'), '10');
    await pastDebounce();

    expect(screen.getByText('Must not be below the minimum')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ maxPrice: '10' }));
  });

  it('offers a reset only when something is filtered, and clears the fields', async () => {
    const { onReset, user } = setup({ ...DEFAULT_FILTERS, search: 'mouse' }, true);

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Search')).toHaveValue('');
  });

  it('has no reset button for the plain catalog', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument();
  });
});
