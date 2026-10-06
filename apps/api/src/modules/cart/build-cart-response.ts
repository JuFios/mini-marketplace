import { Prisma } from '../../generated/prisma/client';
import type { CartItemResponse, CartResponse } from './dto/cart.response.dto';

/** A cart line joined with the product facts the response needs. */
export interface CartLine {
  productId: string;
  quantity: number;
  product: {
    name: string;
    imageUrl: string | null;
    price: Prisma.Decimal;
    stock: number;
    deletedAt: Date | null;
  };
}

/**
 * Builds the cart response. All arithmetic is on `Prisma.Decimal`: floats would turn
 * 0.1 + 0.2 into 0.30000000000000004 on a customer's bill.
 */
export function buildCartResponse(lines: CartLine[]): CartResponse {
  let subtotal = new Prisma.Decimal(0);
  let totalQuantity = 0;

  const items = lines.map((line): CartItemResponse => {
    const lineTotal = line.product.price.mul(line.quantity);
    subtotal = subtotal.add(lineTotal);
    totalQuantity += line.quantity;
    return {
      productId: line.productId,
      name: line.product.name,
      imageUrl: line.product.imageUrl,
      unitPrice: line.product.price.toFixed(2),
      quantity: line.quantity,
      lineTotal: lineTotal.toFixed(2),
      stock: line.product.stock,
      isAvailable: line.product.deletedAt === null,
      exceedsStock: line.quantity > line.product.stock,
    };
  });

  return {
    items,
    totalQuantity,
    subtotal: subtotal.toFixed(2),
    hasIssues: items.some((item) => !item.isAvailable || item.exceedsStock),
  };
}
