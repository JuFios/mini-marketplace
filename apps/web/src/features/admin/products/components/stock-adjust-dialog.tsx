import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { getErrorMessage } from '@/shared/api/error-messages';
import { applyFieldErrors } from '@/shared/lib/form-errors';
import { Alert, Button, FormField, Input, Modal } from '@/shared/ui';
import { stockAdjustmentSchema, type StockAdjustmentValues } from '../schemas';

export interface StockAdjustDialogProps {
  /** The product being adjusted; `null` keeps the dialog closed. */
  product: { id: string; name: string; stock: number } | null;
  onClose: () => void;
  /** Receives the signed change (not the new total) and the optional reason. */
  onSubmit: (delta: number, reason: string) => Promise<void>;
}

const FIELDS = ['delta', 'reason'] as const;

function StockForm({
  product,
  onClose,
  onSubmit,
}: Omit<StockAdjustDialogProps, 'product'> & {
  product: NonNullable<StockAdjustDialogProps['product']>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<StockAdjustmentValues>({
    resolver: zodResolver(stockAdjustmentSchema(product.stock)),
    defaultValues: { delta: '', reason: '' },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const delta = useWatch({ control, name: 'delta' }).trim();
  const preview = /^[+-]?\d+$/.test(delta) ? product.stock + Number(delta) : null;

  const submit = handleSubmit(async ({ delta: text, reason }) => {
    setFormError(null);
    try {
      await onSubmit(Number(text), reason);
    } catch (error) {
      if (!applyFieldErrors(error, FIELDS, setError)) setFormError(getErrorMessage(error));
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      {formError && <Alert>{formError}</Alert>}
      <p>
        In stock now: <strong>{product.stock}</strong>
        {preview !== null && preview >= 0 && (
          <>
            {' '}
            → after the change: <strong>{preview}</strong>
          </>
        )}
      </p>
      <FormField
        label="Change"
        hint="Positive adds units, negative removes them."
        error={errors.delta?.message}
      >
        {(field) => (
          <Input
            inputMode="numeric"
            placeholder="e.g. 10 or -3"
            {...field}
            {...register('delta')}
          />
        )}
      </FormField>
      <FormField label="Reason (optional)" error={errors.reason?.message}>
        {(field) => <Input maxLength={200} {...field} {...register('reason')} />}
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          Apply change
        </Button>
      </div>
    </form>
  );
}

export function StockAdjustDialog({ product, onClose, onSubmit }: StockAdjustDialogProps) {
  return (
    <Modal
      open={product !== null}
      onClose={onClose}
      title={product ? `Adjust stock: ${product.name}` : 'Adjust stock'}
    >
      {/* Keyed by product, so a dialog opened again starts with empty fields. */}
      {product && (
        <StockForm key={product.id} product={product} onClose={onClose} onSubmit={onSubmit} />
      )}
    </Modal>
  );
}
