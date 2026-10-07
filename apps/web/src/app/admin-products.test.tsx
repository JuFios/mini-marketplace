import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as productsApi from '@/features/admin/products/api';
import * as catalogApi from '@/features/catalog/api';
import { ApiError } from '@/shared/api/errors';
import { ADMIN } from '@/test/fake-api';
import {
  ACCESSORIES,
  ADMIN_MOUSE,
  ARCHIVED_KEYBOARD,
  UPLOADED_IMAGE,
  adminProductsPage,
} from '@/test/fixtures';
import { renderApp } from '@/test/render-app';

vi.mock('@/features/admin/products/api');
vi.mock('@/features/catalog/api');
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const fetchList = vi.mocked(productsApi.fetchAdminProducts);
const lastQuery = () => fetchList.mock.lastCall?.[0];

function apiError(status: number, code: string, message = `${code} message`) {
  return new ApiError({ status, code, message, requestId: 'req-3' });
}

beforeEach(() => {
  vi.resetAllMocks();
  fetchList.mockResolvedValue(adminProductsPage([ADMIN_MOUSE, ARCHIVED_KEYBOARD]));
  vi.mocked(catalogApi.fetchCategories).mockResolvedValue([ACCESSORIES]);
});

describe('the admin product table', () => {
  it('lists active and archived products with price, stock and status', async () => {
    renderApp('/admin/products', ADMIN);

    const row = (await screen.findByText('Wireless Mouse')).closest('tr')!;
    expect(within(row).getByText('Accessories')).toBeInTheDocument();
    expect(within(row).getByText('$19.99')).toBeInTheDocument();
    expect(within(row).getByText('20')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    const archived = screen.getByText('Mechanical Keyboard').closest('tr')!;
    expect(within(archived).getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('2 products')).toBeInTheDocument();
  });

  it('offers restoring (not stock or archiving) for an archived product', async () => {
    renderApp('/admin/products', ADMIN);
    await screen.findByText('Wireless Mouse');

    expect(screen.getByRole('button', { name: 'Restore Mechanical Keyboard' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Adjust stock of Mechanical Keyboard' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive Wireless Mouse' })).toBeInTheDocument();
  });

  it('reads the filters from the URL', async () => {
    renderApp(`/admin/products?q=mouse&category=${ACCESSORIES.id}&status=active&page=2`, ADMIN);

    await screen.findByText('Wireless Mouse');

    expect(lastQuery()).toEqual({
      search: 'mouse',
      categoryId: ACCESSORIES.id,
      status: 'active',
      page: 2,
    });
    expect(screen.getByLabelText('Search')).toHaveValue('mouse');
    expect(screen.getByLabelText('Status')).toHaveValue('active');
  });

  it('filters by status at once and by search after typing pauses, starting over from page 1', async () => {
    const { router } = renderApp('/admin/products?page=3', ADMIN);
    await screen.findByText('Wireless Mouse');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Archived');
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: 'archived', page: 1 }));
    expect(router.state.location.search).toBe('?status=archived');

    await userEvent.type(screen.getByLabelText('Search'), 'key');
    await waitFor(() => expect(router.state.location.search).toBe('?q=key&status=archived'));
  });

  it('pages, and the back button returns to the previous page', async () => {
    fetchList.mockResolvedValue(adminProductsPage([ADMIN_MOUSE], { total: 45, totalPages: 3 }));
    const { router } = renderApp('/admin/products', ADMIN);
    await screen.findByText('Wireless Mouse');

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));

    await act(() => router.navigate(-1));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1 }));
  });

  it('invites the first product when there are none, and offers a reset when filters hide all', async () => {
    fetchList.mockResolvedValue(adminProductsPage([]));
    const { router } = renderApp('/admin/products?status=archived', ADMIN);

    expect(await screen.findByText('No products found')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Reset filters' })[1]);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByText('No products yet')).toBeInTheDocument();
  });

  it('shows the error with a retry', async () => {
    fetchList.mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR'));
    renderApp('/admin/products', ADMIN);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Wireless Mouse')).toBeInTheDocument();
  });
});

describe('archiving and restoring', () => {
  it('archives only after confirmation, then reloads the table', async () => {
    vi.mocked(productsApi.archiveProduct).mockResolvedValue(undefined);
    renderApp('/admin/products', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Archive Wireless Mouse' }));
    expect(productsApi.archiveProduct).not.toHaveBeenCalled();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }),
    );

    await waitFor(() => expect(productsApi.archiveProduct).toHaveBeenCalledWith(ADMIN_MOUSE.id));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Archived “Wireless Mouse”'));
    await waitFor(() => expect(fetchList.mock.calls.length).toBeGreaterThan(1));
  });

  it('keeps the product when the confirmation is declined', async () => {
    renderApp('/admin/products', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Archive Wireless Mouse' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep it' }),
    );

    expect(productsApi.archiveProduct).not.toHaveBeenCalled();
  });

  it('restores at once', async () => {
    vi.mocked(productsApi.restoreProduct).mockResolvedValue({
      ...ARCHIVED_KEYBOARD,
      deletedAt: null,
    });
    renderApp('/admin/products', ADMIN);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Restore Mechanical Keyboard' }),
    );

    await waitFor(() =>
      expect(productsApi.restoreProduct).toHaveBeenCalledWith(ARCHIVED_KEYBOARD.id),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Restored “Mechanical Keyboard”'),
    );
  });

  it('says why when the server refuses', async () => {
    vi.mocked(productsApi.archiveProduct).mockRejectedValue(
      apiError(404, 'PRODUCT_NOT_FOUND', 'Product not found'),
    );
    renderApp('/admin/products', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Archive Wireless Mouse' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }),
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Product not found'));
  });
});

describe('adjusting stock', () => {
  it('sends the change as a delta, reports the new stock and reloads the table', async () => {
    vi.mocked(productsApi.adjustStock).mockResolvedValue({ id: ADMIN_MOUSE.id, stock: 25 });
    renderApp('/admin/products', ADMIN);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Adjust stock of Wireless Mouse' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Change'), '5');
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Delivery');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply change' }));

    await waitFor(() =>
      expect(productsApi.adjustStock).toHaveBeenCalledWith(ADMIN_MOUSE.id, 5, 'Delivery'),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Stock of “Wireless Mouse” is now 25'),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchList.mock.calls.length).toBeGreaterThan(1);
  });

  it('sends a removal as a negative delta', async () => {
    vi.mocked(productsApi.adjustStock).mockResolvedValue({ id: ADMIN_MOUSE.id, stock: 17 });
    renderApp('/admin/products', ADMIN);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Adjust stock of Wireless Mouse' }),
    );
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Change'), '-3');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply change' }),
    );

    await waitFor(() =>
      expect(productsApi.adjustStock).toHaveBeenCalledWith(ADMIN_MOUSE.id, -3, undefined),
    );
  });

  it('keeps the dialog open with the API’s message when the stock changed meanwhile', async () => {
    vi.mocked(productsApi.adjustStock).mockRejectedValue(
      apiError(409, 'INSUFFICIENT_STOCK', 'Not enough stock for "Wireless Mouse"'),
    );
    renderApp('/admin/products', ADMIN);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Adjust stock of Wireless Mouse' }),
    );
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Change'), '-5');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply change' }),
    );

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Not enough stock for "Wireless Mouse"',
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('creating a product', () => {
  it('sends the product with its initial stock as a number, then returns to the table', async () => {
    vi.mocked(productsApi.createProduct).mockResolvedValue(ADMIN_MOUSE);
    const { router } = renderApp('/admin/products/new', ADMIN);

    await userEvent.type(await screen.findByLabelText(/^Name/), 'Wireless Mouse');
    await userEvent.type(screen.getByLabelText(/^Description/), 'A small mouse.');
    await userEvent.type(screen.getByLabelText(/^Price/), '19.99');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'Accessories');
    await userEvent.clear(screen.getByLabelText(/Initial stock/));
    await userEvent.type(screen.getByLabelText(/Initial stock/), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() =>
      expect(productsApi.createProduct).toHaveBeenCalledWith({
        name: 'Wireless Mouse',
        description: 'A small mouse.',
        price: '19.99',
        categoryId: ACCESSORIES.id,
        stock: 20,
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/products'));
    expect(toast.success).toHaveBeenCalledWith('Created “Wireless Mouse”');
  });

  it('uploads a picture and saves its address with the product', async () => {
    vi.mocked(productsApi.uploadProductImage).mockResolvedValue(
      '/uploads/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f.png',
    );
    vi.mocked(productsApi.createProduct).mockResolvedValue(ADMIN_MOUSE);
    renderApp('/admin/products/new', ADMIN);

    await userEvent.type(await screen.findByLabelText(/^Name/), 'Wireless Mouse');
    await userEvent.type(screen.getByLabelText(/^Price/), '19.99');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'Accessories');
    await userEvent.upload(
      screen.getByLabelText('Upload an image'),
      new File(['png'], 'mouse.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Image address')).toHaveValue(
        '/uploads/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f.png',
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() =>
      expect(productsApi.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: '/uploads/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f.png' }),
      ),
    );
  });
});

describe('editing a product', () => {
  it('starts from the saved values and saves without the stock', async () => {
    vi.mocked(productsApi.fetchAdminProduct).mockResolvedValue(ADMIN_MOUSE);
    vi.mocked(productsApi.updateProduct).mockResolvedValue(ADMIN_MOUSE);
    const { router } = renderApp(`/admin/products/${ADMIN_MOUSE.id}/edit`, ADMIN);

    const name = await screen.findByLabelText(/^Name/);
    expect(name).toHaveValue('Wireless Mouse');
    expect(screen.queryByLabelText(/stock/i)).not.toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.type(name, 'Wireless Mouse 2');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(productsApi.updateProduct).toHaveBeenCalledWith(ADMIN_MOUSE.id, {
        name: 'Wireless Mouse 2',
        description: 'A small mouse.\nTwo buttons.',
        price: '19.99',
        categoryId: ACCESSORIES.id,
        imageUrl: UPLOADED_IMAGE,
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/products'));
  });

  it('removes the picture by sending null', async () => {
    vi.mocked(productsApi.fetchAdminProduct).mockResolvedValue(ADMIN_MOUSE);
    vi.mocked(productsApi.updateProduct).mockResolvedValue(ADMIN_MOUSE);
    renderApp(`/admin/products/${ADMIN_MOUSE.id}/edit`, ADMIN);

    await userEvent.clear(await screen.findByLabelText('Image address'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(productsApi.updateProduct).toHaveBeenCalledWith(
        ADMIN_MOUSE.id,
        expect.objectContaining({ imageUrl: null }),
      ),
    );
  });

  it('says an archived product is archived', async () => {
    vi.mocked(productsApi.fetchAdminProduct).mockResolvedValue(ARCHIVED_KEYBOARD);
    renderApp(`/admin/products/${ARCHIVED_KEYBOARD.id}/edit`, ADMIN);

    expect(await screen.findByText(/This product is archived/)).toBeInTheDocument();
  });

  it('says there is no such product', async () => {
    vi.mocked(productsApi.fetchAdminProduct).mockRejectedValue(apiError(404, 'PRODUCT_NOT_FOUND'));
    renderApp('/admin/products/nope/edit', ADMIN);

    expect(await screen.findByText('Product not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute(
      'href',
      '/admin/products',
    );
  });
});
