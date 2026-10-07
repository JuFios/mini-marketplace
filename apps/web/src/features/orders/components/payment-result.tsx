import type { Order } from '@/shared/api/types';
import { Alert, Button, Spinner } from '@/shared/ui';
import { describeOutcome } from '../order-outcome';

export interface PaymentResultProps {
  order: Pick<Order, 'status' | 'paymentStatus' | 'cancelReason'>;
  /** The order is still `NEW` after the page stopped asking about it. */
  pollingTimedOut?: boolean;
  /** Offered once polling has timed out, so the customer can ask once more. */
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

/** What the payment (and everything after it) has come to, in words, at the top of an order. */
export function PaymentResult({
  order,
  pollingTimedOut = false,
  onRefresh,
  isRefreshing = false,
}: PaymentResultProps) {
  const { tone, title, description, waiting } = describeOutcome(order, pollingTimedOut);

  return (
    <Alert tone={tone}>
      <div className="flex items-start gap-3">
        {waiting && <Spinner size="sm" decorative className="mt-0.5 shrink-0" />}
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p>{description}</p>
          {pollingTimedOut && onRefresh && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              isLoading={isRefreshing}
              onClick={onRefresh}
            >
              Check again
            </Button>
          )}
        </div>
      </div>
    </Alert>
  );
}
