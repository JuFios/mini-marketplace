import { cn } from '@/shared/lib/cn';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  /** May be below `value` (a cart line above stock): then only decreasing is possible. */
  max?: number;
  disabled?: boolean;
  /** Names the group for screen readers, e.g. the product. */
  label?: string;
  className?: string;
}

const BUTTON =
  'inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white text-lg leading-none text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40';

/** Buttons rather than a number field: each click is one clear change of the quantity. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  label = 'Quantity',
  className,
}: QuantityStepperProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center gap-2', className)}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        className={BUTTON}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output aria-live="polite" className="w-8 text-center text-sm font-medium tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label="Increase quantity"
        className={BUTTON}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
