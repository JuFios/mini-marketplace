import type { OrderStatus } from '@/shared/api/types';
import { Badge, type BadgeProps } from '@/shared/ui';
import { STATUS_LABELS } from '../status';

const TONES: Record<OrderStatus, NonNullable<BadgeProps['tone']>> = {
  NEW: 'warning',
  PROCESSING: 'info',
  SHIPPED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
