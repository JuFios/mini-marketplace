import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useCategoriesQuery } from '@/features/catalog/queries';
import { ApiError } from '@/shared/api/errors';
import { Alert, EmptyState, QueryBoundary, Spinner, buttonStyles } from '@/shared/ui';
import { ProductForm } from '../components/product-form';
import { toCreateInput, toFormValues, toUpdateInput } from '../payload';
import {
  useAdminProductQuery,
  useCreateProduct,
  useUpdateProduct,
  useUploadProductImage,
} from '../queries';

const BACK = '/admin/products';
const spinner = <Spinner size="lg" className="mx-auto my-16 text-brand-600" />;

export function NewProductPage() {
  const navigate = useNavigate();
  const categories = useCategoriesQuery();
  const create = useCreateProduct();
  const upload = useUploadProductImage();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New product</h1>
      <QueryBoundary query={categories} loading={spinner}>
        {(list) => (
          <ProductForm
            mode="create"
            categories={list}
            onSubmit={async (values) => {
              const product = await create.mutateAsync(toCreateInput(values));
              toast.success(`Created “${product.name}”`);
              await navigate(BACK);
            }}
            onUploadImage={(file) => upload.mutateAsync(file)}
            onCancel={() => void navigate(BACK)}
          />
        )}
      </QueryBoundary>
    </div>
  );
}

export function EditProductPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const product = useAdminProductQuery(id);
  const categories = useCategoriesQuery();
  const update = useUpdateProduct(id);
  const upload = useUploadProductImage();

  // 404 for an unknown product, 400 for a malformed id: to an administrator both are "no such product".
  if (product.error instanceof ApiError && [400, 404].includes(product.error.status)) {
    return (
      <EmptyState
        title="Product not found"
        description="It may have been deleted or the link is wrong."
        action={
          <Link to={BACK} className={buttonStyles('primary')}>
            Back to products
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Edit product</h1>
      <QueryBoundary query={product} loading={spinner}>
        {(current) => (
          <div className="space-y-4">
            {current.deletedAt !== null && (
              <Alert tone="info">
                This product is archived: customers cannot see it. Restore it from the product list.
              </Alert>
            )}
            <QueryBoundary query={categories} loading={spinner}>
              {(list) => (
                <ProductForm
                  // Saving refreshes the product; the form starts over from the saved values.
                  key={current.updatedAt}
                  mode="edit"
                  categories={list}
                  defaultValues={toFormValues(current)}
                  onSubmit={async (values) => {
                    await update.mutateAsync(toUpdateInput(values));
                    toast.success('Changes saved');
                    await navigate(BACK);
                  }}
                  onUploadImage={(file) => upload.mutateAsync(file)}
                  onCancel={() => void navigate(BACK)}
                />
              )}
            </QueryBoundary>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
