export class ProductCategoryResponse {
  id!: string;
  name!: string;
}

export class ProductResponse {
  id!: string;
  name!: string;
  description!: string;
  /** Decimal string with two fraction digits, e.g. "129.99". */
  price!: string;
  stock!: number;
  inStock!: boolean;
  imageUrl!: string | null;
  category!: ProductCategoryResponse;
  createdAt!: string;
  updatedAt!: string;
}

export class AdminProductResponse extends ProductResponse {
  /** Set when the product is archived. */
  deletedAt!: string | null;
}

export class StockAdjustmentResponse {
  id!: string;
  stock!: number;
}

export class ImageUploadResponse {
  url!: string;
}
