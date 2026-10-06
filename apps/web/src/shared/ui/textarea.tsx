import type { ComponentProps } from 'react';
import { controlStyles } from './control-styles';

export interface TextareaProps extends ComponentProps<'textarea'> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={controlStyles(invalid, className)}
      {...rest}
    />
  );
}
