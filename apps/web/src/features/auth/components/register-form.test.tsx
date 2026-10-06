import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { RegisterForm } from './register-form';

async function fillAndSubmit({
  name = 'Ann Lee',
  email = 'ann@example.com',
  password = 'secret123',
} = {}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Name'), name);
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText(/^Password/), password);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('RegisterForm validation', () => {
  it('asks for every field', async () => {
    const onSubmit = vi.fn();
    render(<RegisterForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['has no digit', 'onlyletters', 'Password must contain a digit'],
    ['has no letter', '12345678', 'Password must contain a letter'],
    ['is longer than 72 characters', 'a1'.repeat(37), 'Password must be at most 72 characters'],
  ])('rejects a password that %s', async (_label, password, message) => {
    const onSubmit = vi.fn();
    render(<RegisterForm onSubmit={onSubmit} />);

    await fillAndSubmit({ password });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('treats a name of spaces as empty', async () => {
    render(<RegisterForm onSubmit={vi.fn()} />);

    await fillAndSubmit({ name: '   ' });

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
  });

  it('submits valid values', async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<RegisterForm onSubmit={onSubmit} />);

    await fillAndSubmit();

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ann Lee',
      email: 'ann@example.com',
      password: 'secret123',
    });
  });
});

describe('RegisterForm server errors', () => {
  it('puts a taken email on the email field', async () => {
    const onSubmit = () =>
      Promise.reject(
        new ApiError({ status: 409, code: 'EMAIL_ALREADY_REGISTERED', message: 'raw' }),
      );
    render(<RegisterForm onSubmit={onSubmit} />);

    await fillAndSubmit();

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInvalid();
  });

  it('shows anything else on the form', async () => {
    const onSubmit = () =>
      Promise.reject(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'stack trace' }));
    render(<RegisterForm onSubmit={onSubmit} />);

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
  });
});
