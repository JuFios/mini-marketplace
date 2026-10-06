import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';

const TONES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-brand-100 bg-brand-50 text-brand-700',
} as const;

export interface AlertProps extends ComponentProps<'div'> {
  tone?: keyof typeof TONES;
}

/** An inline message about the thing on screen (a failed form submit, say). */
export function Alert({ tone = 'error', className, ...rest }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-2 text-sm', TONES[tone], className)}
      {...rest}
    />
  );
}
