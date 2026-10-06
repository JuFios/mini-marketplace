import { cn } from '@/shared/lib/cn';
import { Button } from './button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  /** Quoted so a person can report it and support can find the request in the logs. */
  requestId?: string | undefined;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  requestId,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-6 py-12 text-center',
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-red-900">{title}</h2>
      <p className="max-w-md text-sm text-red-800">{message}</p>
      {requestId && <p className="text-xs text-red-700">Reference: {requestId}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
