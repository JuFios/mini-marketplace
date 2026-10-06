import type { ComponentProps } from 'react';
import { controlStyles } from './control-styles';

export interface SelectProps extends ComponentProps<'select'> {
  invalid?: boolean;
}

/** A native <select>: accessible, keyboard- and mobile-friendly out of the box. */
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={controlStyles(invalid, className)}
      {...rest}
    >
      {children}
    </select>
  );
}
