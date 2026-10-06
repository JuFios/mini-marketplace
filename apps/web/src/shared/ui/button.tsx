import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';
import { Spinner } from './spinner';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary:
    'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 focus-visible:outline-brand-600',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:outline-brand-600',
} as const;

const SIZES = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
} as const;

/** The look of a button, for the rare element that is a link but should read as one. */
export function buttonStyles(
  variant: keyof typeof VARIANTS = 'primary',
  size: keyof typeof SIZES = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Shows a spinner and blocks clicks; keeps the label so the button does not change width. */
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  // A bare <button> inside a form submits it; submitting must be opted into.
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonStyles(variant, size, className)}
      {...rest}
    >
      {isLoading && <Spinner size="sm" decorative />}
      {children}
    </button>
  );
}
