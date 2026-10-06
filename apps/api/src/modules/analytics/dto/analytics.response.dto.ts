export class TopProductResponse {
  productId!: string;
  name!: string;
  quantitySold!: number;
  /** Revenue of the product's lines at the prices paid, a decimal string. */
  revenue!: string;
}

export class SummaryResponse {
  /** First day of the range, `YYYY-MM-DD` (UTC). */
  from!: string;
  /** Last day of the range, included. */
  to!: string;
  /** Sum of the totals of paid, not cancelled orders, a decimal string. */
  totalRevenue!: string;
  ordersCount!: number;
  /** `totalRevenue / ordersCount` rounded half up to cents; `"0.00"` without orders. */
  averageOrderValue!: string;
  /** At most five, by units sold, then revenue. */
  topProducts!: TopProductResponse[];
}

export class SalesDayResponse {
  /** `YYYY-MM-DD` (UTC). */
  date!: string;
  revenue!: string;
  ordersCount!: number;
}

export class SalesByDayResponse {
  from!: string;
  to!: string;
  /** One entry per day of the range, days without sales included with zeros. */
  days!: SalesDayResponse[];
}
