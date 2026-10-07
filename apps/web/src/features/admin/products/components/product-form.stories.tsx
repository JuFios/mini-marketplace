import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiError } from '@/shared/api/errors';
import type { Category } from '@/shared/api/types';
import { ProductForm } from './product-form';

const categories: Category[] = [
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Accessories', productCount: 12 },
  { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Books', productCount: 30 },
];

const meta = {
  title: 'Admin/ProductForm',
  component: ProductForm,
  args: {
    mode: 'create',
    categories,
    onSubmit: () => Promise.resolve(),
    onUploadImage: () => Promise.resolve('/uploads/3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f.png'),
    onCancel: () => undefined,
  },
} satisfies Meta<typeof ProductForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const Edit: Story = {
  args: {
    mode: 'edit',
    defaultValues: {
      name: 'Wireless Mouse',
      description: 'A small mouse with two buttons.',
      price: '19.99',
      categoryId: categories[0].id,
      stock: '20',
      imageUrl: 'https://images.example.com/mouse.png',
    },
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/^Price/), '19.999');
    await userEvent.click(canvas.getByRole('button', { name: 'Create product' }));
    await expect(await canvas.findByText('Name is required')).toBeInTheDocument();
    await expect(canvas.getByText('Use a price like 19.99')).toBeInTheDocument();
    await expect(canvas.getByText('Choose a category', { selector: 'p' })).toBeInTheDocument();
  },
};

export const ServerErrors: Story = {
  args: {
    onSubmit: () =>
      Promise.reject(
        new ApiError({
          status: 400,
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          details: [{ field: 'name', messages: ['name is already used'] }],
        }),
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/^Name/), 'Wireless Mouse');
    await userEvent.type(canvas.getByLabelText(/^Price/), '19.99');
    await userEvent.selectOptions(canvas.getByLabelText(/^Category/), 'Accessories');
    await userEvent.click(canvas.getByRole('button', { name: 'Create product' }));
    await expect(await canvas.findByText('name is already used')).toBeInTheDocument();
  },
};

export const UploadFails: Story = {
  args: {
    onUploadImage: () =>
      Promise.reject(
        new ApiError({
          status: 415,
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Only PNG, JPEG and WebP images are accepted',
        }),
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const file = new File(['not an image'], 'notes.png', { type: 'image/png' });
    await userEvent.upload(canvas.getByLabelText('Upload an image'), file);
    await expect(
      await canvas.findByText('Only PNG, JPEG and WebP images are accepted'),
    ).toBeInTheDocument();
  },
};
