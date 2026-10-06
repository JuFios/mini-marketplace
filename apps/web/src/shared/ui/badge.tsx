import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';

const TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-brand-100 text-brand-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
} as const;

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: keyof typeof TONES;
}

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
