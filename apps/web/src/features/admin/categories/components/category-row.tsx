import { useState } from 'react';
import type { Category } from '@/shared/api/types';
import { Button } from '@/shared/ui';
import { CategoryNameForm } from './category-name-form';

export interface CategoryRowProps {
  category: Category;
  /** Rejecting shows the message under the field. */
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}

export function CategoryRow({ category, onRename, onDelete }: CategoryRowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-3">
        <CategoryNameForm
          initialName={category.name}
          label={`Name of ${category.name}`}
          submitLabel="Save"
          onSubmit={async (name) => {
            await onRename(name);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{category.name}</p>
        <p className="text-xs text-slate-500">
          {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
        </p>
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Rename ${category.name}`}
          onClick={() => setEditing(true)}
        >
          Rename
        </Button>
        <Button variant="ghost" size="sm" aria-label={`Delete ${category.name}`} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </li>
  );
}
