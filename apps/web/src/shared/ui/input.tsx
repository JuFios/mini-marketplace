import type { ComponentProps } from 'react';
import { controlStyles } from './control-styles';

export interface InputProps extends ComponentProps<'input'> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={controlStyles(invalid, className)}
      {...rest}
    />
  );
}
