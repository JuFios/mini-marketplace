import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { getErrorMessage } from '@/shared/api/error-messages';
import type { Category } from '@/shared/api/types';
import { applyFieldErrors } from '@/shared/lib/form-errors';
import { Alert, Button, FormField, Input, Select, Textarea, Thumbnail } from '@/shared/ui';
import { EMPTY_PRODUCT, isImageUrl, productSchema, type ProductValues } from '../schemas';

/** The API's default upload limit (`UPLOAD_MAX_BYTES`); the server still has the last word. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const FIELDS = ['name', 'description', 'price', 'categoryId', 'stock', 'imageUrl'] as const;

export interface ProductFormProps {
  /** Stock is entered only on creation; afterwards it changes through stock adjustments. */
  mode: 'create' | 'edit';
  categories: Category[];
  defaultValues?: ProductValues;
  /** Rejecting shows the error on the form; resolving leaves the next step (navigation) to the caller. */
  onSubmit: (values: ProductValues) => Promise<void>;
  /** Stores the picture and resolves with the `/uploads/…` path to use as the image address. */
  onUploadImage: (file: File) => Promise<string>;
  onCancel: () => void;
}

export function ProductForm({
  mode,
  categories,
  defaultValues = EMPTY_PRODUCT,
  onSubmit,
  onUploadImage,
  onCancel,
}: ProductFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductValues>({ resolver: zodResolver(productSchema), defaultValues });
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageUrl = useWatch({ control, name: 'imageUrl' }).trim();

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (!applyFieldErrors(error, FIELDS, setError)) setFormError(getErrorMessage(error));
    }
  });

  async function upload(file: File) {
    setUploadError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('The image must be 2 MB or smaller.');
      return;
    }
    setIsUploading(true);
    try {
      const url = await onUploadImage(file);
      setValue('imageUrl', url, { shouldDirty: true, shouldValidate: true });
    } catch (error) {
      setUploadError(getErrorMessage(error));
    } finally {
      setIsUploading(false);
      // Choosing the same file again must fire a change.
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="max-w-2xl space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <FormField label="Name" required error={errors.name?.message}>
        {(field) => <Input maxLength={200} {...field} {...register('name')} />}
      </FormField>
      <FormField label="Description" error={errors.description?.message}>
        {(field) => <Textarea rows={6} {...field} {...register('description')} />}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Category" required error={errors.categoryId?.message}>
          {(field) => (
            <Select {...field} {...register('categoryId')}>
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Price (USD)" required error={errors.price?.message}>
          {(field) => (
            <Input inputMode="decimal" placeholder="19.99" {...field} {...register('price')} />
          )}
        </FormField>
      </div>
      {mode === 'create' && (
        <FormField
          label="Initial stock"
          hint="Later changes are made with “Adjust stock”."
          error={errors.stock?.message}
          className="max-w-48"
        >
          {(field) => <Input inputMode="numeric" {...field} {...register('stock')} />}
        </FormField>
      )}

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">Picture</legend>
        <div className="flex gap-4">
          <Thumbnail
            src={isImageUrl(imageUrl) ? imageUrl : null}
            alt="Product preview"
            className="size-24 shrink-0 rounded-md"
          />
          <div className="min-w-0 flex-1 space-y-3">
            <FormField
              label="Image address"
              hint="An uploaded image or an http(s) link."
              error={errors.imageUrl?.message}
            >
              {(field) => <Input placeholder="https://…" {...field} {...register('imageUrl')} />}
            </FormField>
            <FormField
              label="Upload an image"
              hint="PNG, JPEG or WebP, up to 2 MB."
              error={uploadError ?? undefined}
            >
              {(field) => (
                <Input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={isUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                  }}
                  {...field}
                />
              )}
            </FormField>
            {isUploading && <p className="text-sm text-slate-600">Uploading…</p>}
          </div>
        </div>
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting} disabled={isUploading}>
          {mode === 'create' ? 'Create product' : 'Save changes'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
