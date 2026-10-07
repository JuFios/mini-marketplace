import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { ACCESSORIES } from '@/test/fixtures';
import { toFormValues } from '../payload';
import { ADMIN_MOUSE } from '@/test/fixtures';
import { ProductForm, type ProductFormProps } from './product-form';

const UPLOADED = '/uploads/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f.png';

function setup(props: Partial<ProductFormProps> = {}) {
  const onSubmit = vi.fn<ProductFormProps['onSubmit']>().mockResolvedValue(undefined);
  const onUploadImage = vi.fn<ProductFormProps['onUploadImage']>().mockResolvedValue(UPLOADED);
  render(
    <ProductForm
      mode="create"
      categories={[ACCESSORIES]}
      onSubmit={onSubmit}
      onUploadImage={onUploadImage}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  return { onSubmit, onUploadImage };
}

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(/^Name/), '  Wireless Mouse ');
  await userEvent.type(screen.getByLabelText(/^Price/), '19.99');
  await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'Accessories');
}

describe('ProductForm validation', () => {
  it('names every missing required field and does not submit', async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Price is required')).toBeInTheDocument();
    expect(screen.getByText('Choose a category', { selector: 'p' })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a price with three decimals and a stock that is not a whole number', async () => {
    const { onSubmit } = setup();
    await fillRequired();
    await userEvent.clear(screen.getByLabelText(/^Price/));
    await userEvent.type(screen.getByLabelText(/^Price/), '19.999');
    await userEvent.clear(screen.getByLabelText(/Initial stock/));
    await userEvent.type(screen.getByLabelText(/Initial stock/), '2.5');

    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('Use a price like 19.99')).toBeInTheDocument();
    expect(screen.getByText('Stock must be a whole number')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a picture address that is neither an upload nor an http(s) link', async () => {
    const { onSubmit } = setup();
    await fillRequired();
    await userEvent.type(screen.getByLabelText('Image address'), 'ftp://x.test/a.png');

    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(
      await screen.findByText('Use an uploaded image or an http(s) address'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed values of a valid product', async () => {
    const { onSubmit } = setup();
    await fillRequired();

    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      name: 'Wireless Mouse',
      description: '',
      price: '19.99',
      categoryId: ACCESSORIES.id,
      stock: '0',
      imageUrl: '',
    });
  });
});

describe('ProductForm server answers', () => {
  it('puts the API’s complaint on the field it names', async () => {
    setup({
      onSubmit: () =>
        Promise.reject(
          new ApiError({
            status: 400,
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
            details: [{ field: 'name', messages: ['name is not allowed'] }],
          }),
        ),
    });
    await fillRequired();

    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('name is not allowed')).toBeInTheDocument();
  });

  it('shows any other failure on the form', async () => {
    setup({
      onSubmit: () =>
        Promise.reject(
          new ApiError({ status: 404, code: 'CATEGORY_NOT_FOUND', message: 'Category not found' }),
        ),
    });
    await fillRequired();

    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Category not found');
  });
});

describe('ProductForm in edit mode', () => {
  it('starts from the product and has no stock field', () => {
    setup({ mode: 'edit', defaultValues: toFormValues(ADMIN_MOUSE) });

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Wireless Mouse');
    expect(screen.getByLabelText(/^Price/)).toHaveValue('19.99');
    expect(screen.getByLabelText(/^Category/)).toHaveValue(ACCESSORIES.id);
    expect(screen.queryByLabelText(/stock/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });
});

describe('ProductForm picture', () => {
  it('uploads a chosen file, then uses and previews the returned address', async () => {
    const { onUploadImage } = setup();
    const file = new File(['png bytes'], 'mouse.png', { type: 'image/png' });

    await userEvent.upload(screen.getByLabelText('Upload an image'), file);

    expect(onUploadImage).toHaveBeenCalledWith(file);
    await waitFor(() => expect(screen.getByLabelText('Image address')).toHaveValue(UPLOADED));
    expect(screen.getByRole('img', { name: 'Product preview' })).toHaveAttribute('src', UPLOADED);
  });

  it('refuses a file over 2 MB without sending it', async () => {
    const { onUploadImage } = setup();
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });

    await userEvent.upload(screen.getByLabelText('Upload an image'), big);

    expect(await screen.findByText('The image must be 2 MB or smaller.')).toBeInTheDocument();
    expect(onUploadImage).not.toHaveBeenCalled();
  });

  it('shows why an upload was refused and keeps the address as it was', async () => {
    setup({
      onUploadImage: () =>
        Promise.reject(
          new ApiError({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Only images' }),
        ),
    });

    await userEvent.upload(
      screen.getByLabelText('Upload an image'),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );

    expect(await screen.findByText('Only images')).toBeInTheDocument();
    expect(screen.getByLabelText('Image address')).toHaveValue('');
  });

  it('previews an address typed by hand and falls back to a placeholder for a bad one', async () => {
    setup();

    await userEvent.type(screen.getByLabelText('Image address'), 'https://x.test/a.png');
    expect(screen.getByRole('img', { name: 'Product preview' })).toHaveAttribute(
      'src',
      'https://x.test/a.png',
    );

    await userEvent.clear(screen.getByLabelText('Image address'));
    await userEvent.type(screen.getByLabelText('Image address'), 'nonsense');
    expect(screen.getByRole('img', { name: 'Product preview (no image)' })).toBeInTheDocument();
  });
});
