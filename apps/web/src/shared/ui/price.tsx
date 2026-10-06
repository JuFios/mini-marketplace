import type { ComponentProps } from 'react';
import { formatMoney } from '@/shared/lib/money';

export interface PriceProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** A decimal string exactly as the API sends it, e.g. `"129.99"`. */
  value: string;
}

export function Price({ value, ...rest }: PriceProps) {
  return <span {...rest}>{formatMoney(value)}</span>;
}
