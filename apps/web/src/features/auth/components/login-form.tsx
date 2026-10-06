import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { getErrorMessage } from '@/shared/api/error-messages';
import { applyFieldErrors } from '@/shared/lib/form-errors';
import { Alert, Button, FormField, Input } from '@/shared/ui';
import { loginSchema, type LoginValues } from '../schemas';

export interface LoginFormProps {
  /** Rejecting shows the error on the form; resolving leaves the next step (navigation) to the caller. */
  onSubmit: (values: LoginValues) => Promise<void>;
}

const FIELDS = ['email', 'password'] as const;

export function LoginForm({ onSubmit }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (!applyFieldErrors(error, FIELDS, setError)) setFormError(getErrorMessage(error));
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      {formError && <Alert>{formError}</Alert>}
      <FormField label="Email" error={errors.email?.message}>
        {(control) => (
          <Input type="email" autoComplete="email" {...control} {...register('email')} />
        )}
      </FormField>
      <FormField label="Password" error={errors.password?.message}>
        {(control) => (
          <Input
            type="password"
            autoComplete="current-password"
            {...control}
            {...register('password')}
          />
        )}
      </FormField>
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Log in
      </Button>
    </form>
  );
}
