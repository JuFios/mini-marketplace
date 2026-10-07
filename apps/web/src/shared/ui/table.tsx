import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';

/** A data table that scrolls sideways on a narrow screen instead of squeezing its columns. */
export function Table({ className, ...rest }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className={cn('w-full text-left text-sm', className)} {...rest} />
    </div>
  );
}

export function Th({ className, scope = 'col', ...rest }: ComponentProps<'th'>) {
  return (
    <th
      scope={scope}
      className={cn(
        'border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: ComponentProps<'td'>) {
  return (
    <td className={cn('border-b border-slate-100 px-4 py-3 align-middle', className)} {...rest} />
  );
}
