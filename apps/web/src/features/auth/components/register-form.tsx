import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { getErrorMessage } from '@/shared/api/error-messages';
import { hasErrorCode } from '@/shared/api/errors';
import { applyFieldErrors } from '@/shared/lib/form-errors';
import { Alert, Button, FormField, Input } from '@/shared/ui';
import { registerSchema, type RegisterValues } from '../schemas';

export interface RegisterFormProps {
  /** Rejecting shows the error on the form; resolving leaves the next step (navigation) to the caller. */
  onSubmit: (values: RegisterValues) => Promise<void>;
}

const FIELDS = ['name', 'email', 'password'] as const;

export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (hasErrorCode(error, 'EMAIL_ALREADY_REGISTERED')) {
        setError('email', { type: 'server', message: getErrorMessage(error) });
      } else if (!applyFieldErrors(error, FIELDS, setError)) {
        setFormError(getErrorMessage(error));
      }
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      {formError && <Alert>{formError}</Alert>}
      <FormField label="Name" error={errors.name?.message}>
        {(control) => <Input autoComplete="name" {...control} {...register('name')} />}
      </FormField>
      <FormField label="Email" error={errors.email?.message}>
        {(control) => (
          <Input type="email" autoComplete="email" {...control} {...register('email')} />
        )}
      </FormField>
      <FormField
        label="Password"
        hint="8–72 characters, with at least one letter and one digit."
        error={errors.password?.message}
      >
        {(control) => (
          <Input
            type="password"
            autoComplete="new-password"
            {...control}
            {...register('password')}
          />
        )}
      </FormField>
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Create account
      </Button>
    </form>
  );
}
