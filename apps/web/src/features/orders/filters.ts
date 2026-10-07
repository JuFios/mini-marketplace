import { ORDER_STATUSES, type OrderStatus } from '@/shared/api/types';

export const ORDERS_PAGE_SIZE = 10;

export interface OrderFilters {
  /** Empty means every status. */
  status: OrderStatus | '';
  /** 1-based. */
  page: number;
}

export const DEFAULT_FILTERS: OrderFilters = { status: '', page: 1 };

const MAX_PAGE = 100_000;

export function isOrderStatus(value: string | null): value is OrderStatus {
  return ORDER_STATUSES.some((status) => status === value);
}

/** Filters from a URL that anyone can edit by hand: what the API would reject is dropped. */
export function parseFilters(params: URLSearchParams): OrderFilters {
  const status = params.get('status');
  const page = Number(params.get('page'));
  return {
    status: isOrderStatus(status) ? status : '',
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The URL form of the filters; defaults are left out. */
export function toSearchParams(filters: OrderFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/** The query of `GET /orders`; an empty status is `undefined` so axios leaves it out. */
export function toApiParams(filters: OrderFilters) {
  return {
    page: filters.page,
    limit: ORDERS_PAGE_SIZE,
    status: filters.status || undefined,
  };
}
