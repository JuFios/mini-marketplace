import { useState } from 'react';
import { toast } from 'sonner';
import { useCategoriesQuery } from '@/features/catalog/queries';
import type { Category } from '@/shared/api/types';
import { Alert, ConfirmDialog, EmptyState, QueryBoundary } from '@/shared/ui';
import { CategoryNameForm } from '../components/category-name-form';
import { CategoryRow } from '../components/category-row';
import { getCategoryErrorMessage } from '../errors';
import { useCreateCategory, useDeleteCategory, useRenameCategory } from '../queries';

export function CategoriesPage() {
  const categories = useCategoriesQuery();
  const create = useCreateCategory();
  const rename = useRenameCategory();
  const remove = useDeleteCategory();
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
      <div className="max-w-xl rounded-lg border border-slate-200 bg-white p-4">
        <CategoryNameForm
          label="New category name"
          submitLabel="Add category"
          onSubmit={async (name) => {
            await create.mutateAsync(name);
            toast.success(`Added “${name}”`);
          }}
        />
      </div>
      {deleteError && <Alert className="max-w-xl">{deleteError}</Alert>}
      <QueryBoundary
        query={categories}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState title="No categories yet" description="Add one above." />}
      >
        {(data) => (
          <ul className="max-w-xl divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-4">
            {data.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                onRename={async (name) => {
                  await rename.mutateAsync({ id: category.id, name });
                }}
                onDelete={() => {
                  setDeleteError(null);
                  setDeleting(category);
                }}
              />
            ))}
          </ul>
        )}
      </QueryBoundary>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          const { id, name } = deleting;
          remove.mutate(id, {
            onSuccess: () => toast.success(`Deleted “${name}”`),
            // A category that still has products stays; the reason is shown above the list.
            onError: (error) => setDeleteError(`“${name}”: ${getCategoryErrorMessage(error)}`),
          });
        }}
        title="Delete this category?"
        confirmLabel="Delete"
        cancelLabel="Keep it"
      >
        {deleting && <>“{deleting.name}” will be removed. This cannot be undone.</>}
      </ConfirmDialog>
    </div>
  );
}
