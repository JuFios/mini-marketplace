import type { DateRange } from './dashboard/date-range';
import type { AdminOrderFilters } from './orders/filters';
import type { AdminProductFilters } from './products/filters';

// Everything the admin area reads sits under `['admin', …]`, apart from the public catalog data
// (`['products']`, `['categories']`) that its writes also make stale.
export const adminKeys = {
  products: ['admin', 'products'] as const,
  productList: (filters: AdminProductFilters) => ['admin', 'products', 'list', filters] as const,
  product: (id: string) => ['admin', 'products', 'detail', id] as const,
  orders: ['admin', 'orders'] as const,
  orderLists: ['admin', 'orders', 'list'] as const,
  orderList: (filters: AdminOrderFilters) => ['admin', 'orders', 'list', filters] as const,
  order: (id: string) => ['admin', 'orders', 'detail', id] as const,
  summary: (range: DateRange) => ['admin', 'analytics', 'summary', range] as const,
  salesByDay: (range: DateRange) => ['admin', 'analytics', 'sales-by-day', range] as const,
};
