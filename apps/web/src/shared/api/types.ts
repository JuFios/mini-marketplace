// Hand-written mirror of the API contract (Swagger is the source of truth); only what the
// frontend uses is declared here.

export type Role = 'CUSTOMER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  /** Lifetime of the access token in seconds. */
  expiresIn: number;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface Category {
  id: string;
  name: string;
  /** Live (not archived) products only. */
  productCount: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Decimal string, e.g. `"129.99"`. */
  price: string;
  stock: number;
  inStock: boolean;
  /** A path under `/uploads` or an absolute https URL. */
  imageUrl: string | null;
  category: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  imageUrl: string | null;
  /** The product's current price: a cart never freezes prices. */
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  stock: number;
  /** False once the product has been archived. */
  isAvailable: boolean;
  exceedsStock: boolean;
}

export interface Cart {
  items: CartItem[];
  totalQuantity: number;
  /** Covers every line, unavailable ones included. */
  subtotal: string;
  /** Some line is unavailable or above stock, so checkout would refuse it. */
  hasIssues: boolean;
}

export const ORDER_STATUSES = ['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'VOIDED';
export type CancelReason = 'CUSTOMER_REQUEST' | 'ADMIN_ACTION' | 'PAYMENT_FAILED';

export interface OrderItem {
  productId: string;
  /** The name when the order was placed; later edits do not change it. */
  productName: string;
  /** The price paid per unit. */
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  cancelReason: CancelReason | null;
  totalAmount: string;
  shippingAddress: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  /** What the caller may move the order to right now; for a customer, `CANCELLED` or nothing. */
  allowedTransitions: OrderStatus[];
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: string;
  /** Number of lines (distinct products), not of units. */
  itemsCount: number;
  createdAt: string;
}

export interface OrderCustomer {
  id: string;
  email: string;
  name: string;
}

export interface AdminOrderSummary extends OrderSummary {
  customer: OrderCustomer;
}

export interface AdminOrder extends Order {
  customer: OrderCustomer;
}

/** A product as an administrator sees it: archived ones included. */
export interface AdminProduct extends Product {
  /** Set while the product is archived. */
  deletedAt: string | null;
}

export interface StockAdjustmentResult {
  id: string;
  stock: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: string;
}

export interface SalesSummary {
  from: string;
  to: string;
  totalRevenue: string;
  ordersCount: number;
  averageOrderValue: string;
  topProducts: TopProduct[];
}

export interface SalesDay {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  revenue: string;
  ordersCount: number;
}

export interface SalesByDay {
  from: string;
  to: string;
  days: SalesDay[];
}
