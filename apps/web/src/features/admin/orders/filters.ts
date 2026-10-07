import type { OrderStatus } from '@/shared/api/types';
import { isOrderStatus } from '@/features/orders/filters';
import { isCalendarDay } from '../days';

export const ADMIN_ORDERS_PAGE_SIZE = 20;

export interface AdminOrderFilters {
  /** Empty means every status. */
  status: OrderStatus | '';
  /** `YYYY-MM-DD` (UTC), inclusive; empty means no bound. */
  from: string;
  to: string;
  /** A case-insensitive part of the customer's email; empty means everyone. */
  customerEmail: string;
  /** 1-based. */
  page: number;
}

export const DEFAULT_FILTERS: AdminOrderFilters = {
  status: '',
  from: '',
  to: '',
  customerEmail: '',
  page: 1,
};

const MAX_EMAIL_LENGTH = 254;
const MAX_PAGE = 100_000;

/** Both days are known to be real days here; empty means "no bound". */
export function isDayRangeOrdered(from: string, to: string): boolean {
  return from === '' || to === '' || from <= to;
}

/** Filters from a URL that anyone can edit by hand: what the API would reject is dropped. */
export function parseFilters(params: URLSearchParams): AdminOrderFilters {
  const status = params.get('status');
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page'));

  const validFrom = isCalendarDay(from) ? from : '';
  const validTo = isCalendarDay(to) && isDayRangeOrdered(validFrom, to) ? to : '';
  return {
    status: isOrderStatus(status) ? status : '',
    from: validFrom,
    to: validTo,
    customerEmail: (params.get('email') ?? '').trim().slice(0, MAX_EMAIL_LENGTH),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The URL form of the filters; defaults are left out. */
export function toSearchParams(filters: AdminOrderFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.customerEmail) params.set('email', filters.customerEmail);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/** The query of `GET /admin/orders`; empty values are `undefined` so axios leaves them out. */
export function toApiParams(filters: AdminOrderFilters) {
  return {
    page: filters.page,
    limit: ADMIN_ORDERS_PAGE_SIZE,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    customerEmail: filters.customerEmail || undefined,
  };
}

export function hasActiveFilters(filters: AdminOrderFilters): boolean {
  return Boolean(filters.status || filters.from || filters.to || filters.customerEmail);
}
