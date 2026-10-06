import { cn } from '@/shared/lib/cn';

/** Shared look of Input, Select and Textarea. */
export function controlStyles(invalid: boolean | undefined, className: string | undefined): string {
  return cn(
    'block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm',
    'placeholder:text-slate-400',
    'focus-visible:outline-2 focus-visible:outline-offset-0',
    'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
    invalid
      ? 'border-red-500 focus-visible:outline-red-500'
      : 'border-slate-300 focus-visible:outline-brand-600',
    className,
  );
}
