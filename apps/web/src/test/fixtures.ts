import type {
  AdminOrder,
  AdminOrderSummary,
  AdminProduct,
  Cart,
  CartItem,
  Category,
  Order,
  OrderSummary,
  Paginated,
  Product,
  SalesByDay,
  SalesSummary,
} from '@/shared/api/types';

export const MOUSE: Product = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Wireless Mouse',
  description: 'A small mouse.\nTwo buttons.',
  price: '19.99',
  stock: 20,
  inStock: true,
  imageUrl: '/uploads/mouse.png',
  category: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Accessories' },
  createdAt: '2026-10-05T12:00:00.000Z',
  updatedAt: '2026-10-05T12:00:00.000Z',
};

export const KEYBOARD: Product = {
  ...MOUSE,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Mechanical Keyboard',
  price: '89.50',
  stock: 3,
  imageUrl: null,
};

export const ACCESSORIES: Category = {
  id: MOUSE.category.id,
  name: 'Accessories',
  productCount: 2,
};

export function page(items: Product[], overrides: Partial<Paginated<Product>['meta']> = {}) {
  return {
    items,
    meta: { page: 1, limit: 12, total: items.length, totalPages: 1, ...overrides },
  } satisfies Paginated<Product>;
}

export function cartItem(product: Product, quantity: number, overrides: Partial<CartItem> = {}) {
  const cents = Math.round(Number(product.price) * 100) * quantity;
  return {
    productId: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    unitPrice: product.price,
    quantity,
    lineTotal: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`,
    stock: product.stock,
    isAvailable: true,
    exceedsStock: quantity > product.stock,
    ...overrides,
  } satisfies CartItem;
}

/** A cart whose totals are written out by the caller, so a test never leans on the code under test. */
export function cart(items: CartItem[], totals: Pick<Cart, 'subtotal'>): Cart {
  return {
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: totals.subtotal,
    hasIssues: items.some((item) => !item.isAvailable || item.exceedsStock),
  };
}

export const EMPTY_CART: Cart = { items: [], totalQuantity: 0, subtotal: '0.00', hasIssues: false };

export const ORDER_ID = '3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f';

/** What the page shows for `ORDER_ID`. */
export const ORDER_NUMBER = '#3F2A9C1D';

/** 1 × 89.50 + 2 × 19.99 = 129.48, written out so a test never leans on the code under test. */
export function order(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    status: 'NEW',
    paymentStatus: 'PENDING',
    cancelReason: null,
    totalAmount: '129.48',
    shippingAddress: '12 Main Street\nSpringfield, 12345',
    items: [
      {
        productId: KEYBOARD.id,
        productName: 'Mechanical Keyboard',
        unitPrice: '89.50',
        quantity: 1,
        lineTotal: '89.50',
      },
      {
        productId: MOUSE.id,
        productName: 'Wireless Mouse',
        unitPrice: '19.99',
        quantity: 2,
        lineTotal: '39.98',
      },
    ],
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
    allowedTransitions: ['CANCELLED'],
    ...overrides,
  };
}

export function orderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: ORDER_ID,
    status: 'PROCESSING',
    paymentStatus: 'PAID',
    totalAmount: '129.48',
    itemsCount: 2,
    createdAt: '2026-10-05T12:00:00.000Z',
    ...overrides,
  };
}

export function ordersPage(
  items: OrderSummary[],
  overrides: Partial<Paginated<OrderSummary>['meta']> = {},
) {
  return {
    items,
    meta: { page: 1, limit: 10, total: items.length, totalPages: 1, ...overrides },
  } satisfies Paginated<OrderSummary>;
}

/** An uploaded picture's path looks like this; the API accepts no other `/uploads` form. */
export const UPLOADED_IMAGE = '/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';

export const ADMIN_MOUSE: AdminProduct = { ...MOUSE, imageUrl: UPLOADED_IMAGE, deletedAt: null };

export const ARCHIVED_KEYBOARD: AdminProduct = {
  ...KEYBOARD,
  deletedAt: '2026-10-06T12:00:00.000Z',
};

export function adminProductsPage(
  items: AdminProduct[],
  overrides: Partial<Paginated<AdminProduct>['meta']> = {},
) {
  return {
    items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: 1, ...overrides },
  } satisfies Paginated<AdminProduct>;
}

export const ORDER_CUSTOMER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ann@example.com',
  name: 'Ann Lee',
};

export function adminOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    ...order({
      status: 'PROCESSING',
      paymentStatus: 'PAID',
      allowedTransitions: ['SHIPPED', 'CANCELLED'],
    }),
    customer: ORDER_CUSTOMER,
    ...overrides,
  };
}

export function adminOrderSummary(overrides: Partial<AdminOrderSummary> = {}): AdminOrderSummary {
  return { ...orderSummary(), customer: ORDER_CUSTOMER, ...overrides };
}

export function adminOrdersPage(
  items: AdminOrderSummary[],
  overrides: Partial<Paginated<AdminOrderSummary>['meta']> = {},
) {
  return {
    items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: 1, ...overrides },
  } satisfies Paginated<AdminOrderSummary>;
}

/** Two sales: 2 × 19.99 + 1 × 89.50 = 129.48 (order one) and 19.99 (order two): 149.47 over 2 orders. */
export const SALES_SUMMARY: SalesSummary = {
  from: '2026-09-08',
  to: '2026-10-07',
  totalRevenue: '149.47',
  ordersCount: 2,
  averageOrderValue: '74.74',
  topProducts: [
    { productId: MOUSE.id, name: 'Wireless Mouse', quantitySold: 3, revenue: '59.97' },
    { productId: KEYBOARD.id, name: 'Mechanical Keyboard', quantitySold: 1, revenue: '89.50' },
  ],
};

export const SALES_BY_DAY: SalesByDay = {
  from: '2026-10-06',
  to: '2026-10-07',
  days: [
    { date: '2026-10-06', revenue: '129.48', ordersCount: 1 },
    { date: '2026-10-07', revenue: '19.99', ordersCount: 1 },
  ],
};
