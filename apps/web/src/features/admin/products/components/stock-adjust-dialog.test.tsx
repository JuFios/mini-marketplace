import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { StockAdjustDialog, type StockAdjustDialogProps } from './stock-adjust-dialog';

const PRODUCT = { id: 'p-1', name: 'Wireless Mouse', stock: 10 };

function setup(onSubmit: StockAdjustDialogProps['onSubmit'] = () => Promise.resolve()) {
  const submit = vi.fn(onSubmit);
  const onClose = vi.fn();
  render(<StockAdjustDialog product={PRODUCT} onClose={onClose} onSubmit={submit} />);
  return { submit, onClose };
}

const apply = () => userEvent.click(screen.getByRole('button', { name: 'Apply change' }));

describe('StockAdjustDialog', () => {
  it('sends the signed change, not the new total', async () => {
    const { submit } = setup();

    await userEvent.type(screen.getByLabelText('Change'), '-3');
    await apply();

    await waitFor(() => expect(submit).toHaveBeenCalledWith(-3, ''));
  });

  it('sends an addition, with the reason when there is one', async () => {
    const { submit } = setup();

    await userEvent.type(screen.getByLabelText('Change'), '+25');
    await userEvent.type(screen.getByLabelText('Reason (optional)'), '  Restock from supplier ');
    await apply();

    await waitFor(() => expect(submit).toHaveBeenCalledWith(25, 'Restock from supplier'));
  });

  it('shows what the stock will be after the change', async () => {
    setup();
    expect(screen.getByText('10')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Change'), '-4');

    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('refuses 0 and a change that would take the stock below 0 or past 1 000 000, without sending anything', async () => {
    const { submit } = setup();

    await userEvent.type(screen.getByLabelText('Change'), '0');
    await apply();
    expect(await screen.findByText('The change cannot be 0')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Change'));
    await userEvent.type(screen.getByLabelText('Change'), '-11');
    await apply();
    expect(await screen.findByText('Stock cannot go below 0 (there are 10)')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Change'));
    await userEvent.type(screen.getByLabelText('Change'), '999991');
    await apply();
    expect(
      await screen.findByText('Stock cannot go above 1000000 (there are 10)'),
    ).toBeInTheDocument();

    expect(submit).not.toHaveBeenCalled();
  });

  it('shows the API’s refusal of the change (the stock changed meanwhile) on the field', async () => {
    const limit = 'Stock cannot go above 1000000 (current stock: 999995)';
    setup(() =>
      Promise.reject(
        new ApiError({
          status: 400,
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: [{ field: 'delta', messages: [limit] }],
        }),
      ),
    );

    await userEvent.type(screen.getByLabelText('Change'), '5');
    await apply();

    expect(await screen.findByText(limit)).toBeInTheDocument();
    expect(screen.getByLabelText('Change')).toHaveAccessibleDescription(
      expect.stringContaining(limit),
    );
  });

  it('shows the API’s refusal (the stock changed meanwhile) and stays open', async () => {
    const { onClose } = setup(() =>
      Promise.reject(
        new ApiError({
          status: 409,
          code: 'INSUFFICIENT_STOCK',
          message: 'Not enough stock for "Wireless Mouse"',
        }),
      ),
    );

    await userEvent.type(screen.getByLabelText('Change'), '-5');
    await apply();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not enough stock for "Wireless Mouse"',
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('starts with empty fields every time it is opened for a product', async () => {
    const { rerender } = render(
      <StockAdjustDialog product={PRODUCT} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    await userEvent.type(screen.getAllByLabelText('Change')[0], '7');

    rerender(<StockAdjustDialog product={null} onClose={vi.fn()} onSubmit={vi.fn()} />);
    rerender(<StockAdjustDialog product={PRODUCT} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getAllByLabelText('Change')[0]).toHaveValue('');
  });
});
