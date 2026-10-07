import { cn } from '@/shared/lib/cn';

const SIZES = { sm: 'size-4', md: 'size-6', lg: 'size-10' } as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  /** Announced to screen readers. Ignored when `decorative`. */
  label?: string;
  /** For a spinner inside something that already says what is happening (a loading button). */
  decorative?: boolean;
  className?: string;
}

export function Spinner({
  size = 'md',
  label = 'Loading',
  decorative = false,
  className,
}: SpinnerProps) {
  return (
    <span
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative || undefined}
      // A block-level box that is only as wide as the spinner: auto margins can centre it (they do
      // nothing on an inline box), and inside a flex container, like a button, it is a flex item anyway.
      className={cn('flex w-fit', className)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn('animate-spin text-current', SIZES[size])}
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          className="opacity-25"
        />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  );
}
