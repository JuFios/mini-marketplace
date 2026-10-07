import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as categoriesApi from '@/features/admin/categories/api';
import * as catalogApi from '@/features/catalog/api';
import { ApiError } from '@/shared/api/errors';
import type { Category } from '@/shared/api/types';
import { ADMIN } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

vi.mock('@/features/admin/categories/api');
vi.mock('@/features/catalog/api');
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const BOOKS: Category = {
  id: 'b0000000-0000-4000-8000-000000000001',
  name: 'Books',
  productCount: 30,
};
const TOYS: Category = {
  id: 'b0000000-0000-4000-8000-000000000002',
  name: 'Toys',
  productCount: 1,
};

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, message: `${code} message` });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(catalogApi.fetchCategories).mockResolvedValue([BOOKS, TOYS]);
});

describe('the category list', () => {
  it('lists the categories with their product counts', async () => {
    renderApp('/admin/categories', ADMIN);

    expect(await screen.findByText('Books')).toBeInTheDocument();
    expect(screen.getByText('30 products')).toBeInTheDocument();
    expect(screen.getByText('1 product')).toBeInTheDocument();
  });

  it('says so when there are none', async () => {
    vi.mocked(catalogApi.fetchCategories).mockResolvedValue([]);
    renderApp('/admin/categories', ADMIN);

    expect(await screen.findByText('No categories yet')).toBeInTheDocument();
  });
});

describe('adding a category', () => {
  it('sends the trimmed name and reloads the list', async () => {
    vi.mocked(categoriesApi.createCategory).mockResolvedValue({
      id: 'b0000000-0000-4000-8000-000000000003',
      name: 'Garden',
      productCount: 0,
    });
    renderApp('/admin/categories', ADMIN);

    await userEvent.type(await screen.findByLabelText('New category name'), '  Garden ');
    await userEvent.click(screen.getByRole('button', { name: 'Add category' }));

    await waitFor(() => expect(categoriesApi.createCategory).toHaveBeenCalledWith('Garden'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added “Garden”'));
    await waitFor(() =>
      expect(vi.mocked(catalogApi.fetchCategories).mock.calls.length).toBeGreaterThan(1),
    );
    // The field is empty again, ready for the next one.
    expect(screen.getByLabelText('New category name')).toHaveValue('');
  });

  it('asks for a name before calling the server', async () => {
    renderApp('/admin/categories', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Add category' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(categoriesApi.createCategory).not.toHaveBeenCalled();
  });

  it('says when the name is taken, and keeps what was typed', async () => {
    vi.mocked(categoriesApi.createCategory).mockRejectedValue(apiError(409, 'CATEGORY_NAME_TAKEN'));
    renderApp('/admin/categories', ADMIN);

    await userEvent.type(await screen.findByLabelText('New category name'), 'Books');
    await userEvent.click(screen.getByRole('button', { name: 'Add category' }));

    expect(
      await screen.findByText('A category with this name already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New category name')).toHaveValue('Books');
  });
});

describe('renaming a category', () => {
  it('renames in place', async () => {
    vi.mocked(categoriesApi.renameCategory).mockResolvedValue({ ...BOOKS, name: 'Literature' });
    renderApp('/admin/categories', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Books' }));
    const field = screen.getByLabelText('Name of Books');
    expect(field).toHaveValue('Books');
    await userEvent.clear(field);
    await userEvent.type(field, 'Literature');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(categoriesApi.renameCategory).toHaveBeenCalledWith(BOOKS.id, 'Literature'),
    );
    await waitFor(() => expect(screen.queryByLabelText('Name of Books')).not.toBeInTheDocument());
  });

  it('stays in edit mode with the reason when the name is taken, and can be cancelled', async () => {
    vi.mocked(categoriesApi.renameCategory).mockRejectedValue(apiError(409, 'CATEGORY_NAME_TAKEN'));
    renderApp('/admin/categories', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Books' }));
    const field = screen.getByLabelText('Name of Books');
    await userEvent.clear(field);
    await userEvent.type(field, 'Toys');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('A category with this name already exists.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name of Books')).not.toBeInTheDocument();
    expect(screen.getByText('Books')).toBeInTheDocument();
  });
});

describe('deleting a category', () => {
  it('deletes only after confirmation', async () => {
    vi.mocked(categoriesApi.deleteCategory).mockResolvedValue(undefined);
    renderApp('/admin/categories', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Toys' }));
    expect(categoriesApi.deleteCategory).not.toHaveBeenCalled();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => expect(categoriesApi.deleteCategory).toHaveBeenCalledWith(TOYS.id));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Deleted “Toys”'));
  });

  it('shows CATEGORY_IN_USE with the category’s name, and the category stays', async () => {
    vi.mocked(categoriesApi.deleteCategory).mockRejectedValue(apiError(409, 'CATEGORY_IN_USE'));
    renderApp('/admin/categories', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Books' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '“Books”: This category still has products (archived ones count too). Move or delete them first.',
    );
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('forgets the old complaint when another delete is started', async () => {
    vi.mocked(categoriesApi.deleteCategory).mockRejectedValue(apiError(409, 'CATEGORY_IN_USE'));
    renderApp('/admin/categories', ADMIN);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Books' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Delete Toys' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
