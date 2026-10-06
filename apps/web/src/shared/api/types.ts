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
  /** A path under `/uploads` or an absolute http(s) URL. */
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
