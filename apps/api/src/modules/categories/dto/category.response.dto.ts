export class CategoryResponse {
  id!: string;
  name!: string;
  /** Number of live (not archived) products in the category. */
  productCount!: number;
}
