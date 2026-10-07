import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { applyFieldErrors } from '@/shared/lib/form-errors';
import { Alert, Button, FormField, Textarea } from '@/shared/ui';
import { getCheckoutErrorMessage } from '../errors';
import { shippingSchema, type ShippingValues } from '../schemas';

export interface CheckoutFormProps {
  /** Rejecting shows the error on the form; resolving leaves the next step (navigation) to the caller. */
  onSubmit: (values: ShippingValues) => Promise<void>;
  /** Blocks paying (the cart has lines that would be refused) without hiding the form. */
  disabled?: boolean;
}

const FIELDS = ['shippingAddress'] as const;

export function CheckoutForm({ onSubmit, disabled = false }: CheckoutFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ShippingValues>({
    resolver: zodResolver(shippingSchema),
    defaultValues: { shippingAddress: '' },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (!applyFieldErrors(error, FIELDS, setError)) setFormError(getCheckoutErrorMessage(error));
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      {formError && <Alert>{formError}</Alert>}
      <FormField
        label="Shipping address"
        required
        hint="Street, city, postal code and country."
        error={errors.shippingAddress?.message}
      >
        {(control) => (
          <Textarea autoComplete="street-address" {...control} {...register('shippingAddress')} />
        )}
      </FormField>
      <Button type="submit" size="lg" isLoading={isSubmitting} disabled={disabled}>
        Pay (mock)
      </Button>
      <p className="text-xs text-slate-500">
        This is a demo shop: the payment is simulated and no money is taken.
      </p>
    </form>
  );
}
