import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { applyFieldErrors } from '@/shared/lib/form-errors';
import { Button, FormField, Input } from '@/shared/ui';
import { getCategoryErrorMessage } from '../errors';
import { categorySchema, type CategoryValues } from '../schemas';

export interface CategoryNameFormProps {
  /** The name to start from (rename); empty for a new category. */
  initialName?: string;
  /** Names the field for screen readers, e.g. "New category name". */
  label: string;
  submitLabel: string;
  /** Rejecting shows the message under the field. */
  onSubmit: (name: string) => Promise<void>;
  /** Offers a Cancel button when given (rename). */
  onCancel?: () => void;
}

/** One line: a name field and its button. Used to add a category and to rename one in place. */
export function CategoryNameForm({
  initialName = '',
  label,
  submitLabel,
  onSubmit,
  onCancel,
}: CategoryNameFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: initialName },
  });

  const submit = handleSubmit(async ({ name }) => {
    try {
      await onSubmit(name);
      reset({ name: initialName });
    } catch (error) {
      // Everything a name can go wrong with (taken, too long, in use) is shown under the field.
      if (!applyFieldErrors(error, ['name'], setError)) {
        setError('name', { type: 'server', message: getCategoryErrorMessage(error) });
      }
    }
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-wrap items-start gap-2"
    >
      <FormField label={label} error={errors.name?.message} className="min-w-56 flex-1">
        {(control) => <Input maxLength={100} {...control} {...register('name')} />}
      </FormField>
      <div className="flex gap-2 pt-6">
        <Button type="submit" size="md" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
