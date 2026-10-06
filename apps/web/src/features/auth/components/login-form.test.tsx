import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { deferred } from '@/test/fake-api';
import { LoginForm } from './login-form';

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('LoginForm validation', () => {
  it('asks for both fields and does not submit an empty form', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInvalid();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await fillAndSubmit('not-an-email', 'secret123');

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits trimmed credentials once they are valid', async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<LoginForm onSubmit={onSubmit} />);

    await fillAndSubmit('  ann@example.com ', 'secret123');

    expect(onSubmit).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'secret123' });
  });
});

describe('LoginForm submission', () => {
  it('disables the button while the request runs', async () => {
    const pending = deferred<void>();
    render(<LoginForm onSubmit={() => pending.promise} />);

    await fillAndSubmit('ann@example.com', 'secret123');

    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
    pending.resolve();
  });

  it('shows wrong credentials on the form, not on a field', async () => {
    const onSubmit = () =>
      Promise.reject(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'raw' }));
    render(<LoginForm onSubmit={onSubmit} />);

    await fillAndSubmit('ann@example.com', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.getByLabelText('Email')).toBeValid();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('shows throttling as a plain message', async () => {
    const onSubmit = () =>
      Promise.reject(new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', message: 'raw' }));
    render(<LoginForm onSubmit={onSubmit} />);

    await fillAndSubmit('ann@example.com', 'secret123');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
  });

  it('puts the API field errors on their fields', async () => {
    const onSubmit = () =>
      Promise.reject(
        new ApiError({
          status: 400,
          code: 'VALIDATION_FAILED',
          message: 'raw',
          details: [{ field: 'email', messages: ['email must be an email'] }],
        }),
      );
    render(<LoginForm onSubmit={onSubmit} />);

    await fillAndSubmit('ann@example.com', 'secret123');

    expect(await screen.findByText('email must be an email')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears an earlier error when submitted again', async () => {
    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'raw' }),
      )
      .mockResolvedValueOnce(undefined);
    render(<LoginForm onSubmit={onSubmit} />);
    await fillAndSubmit('ann@example.com', 'wrong-password');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
