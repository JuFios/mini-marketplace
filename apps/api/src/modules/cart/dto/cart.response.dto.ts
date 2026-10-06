export class CartItemResponse {
  productId!: string;
  name!: string;
  imageUrl!: string | null;
  /** The product's current price as a decimal string; a cart never freezes prices. */
  unitPrice!: string;
  quantity!: number;
  /** `unitPrice × quantity`, a decimal string. */
  lineTotal!: string;
  stock!: number;
  /** False when the product has been archived. */
  isAvailable!: boolean;
  /** True when `quantity` is more than the units currently in stock. */
  exceedsStock!: boolean;
}

export class CartResponse {
  items!: CartItemResponse[];
  totalQuantity!: number;
  /** Sum of all line totals, a decimal string. */
  subtotal!: string;
  /** Any line is unavailable or exceeds stock: checkout would be refused. */
  hasIssues!: boolean;
}
