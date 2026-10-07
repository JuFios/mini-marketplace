import type { TopProduct } from '@/shared/api/types';
import { Price, Table, Td, Th } from '@/shared/ui';

export function TopProductsTable({ products }: { products: TopProduct[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Product</Th>
          <Th className="text-right">Units sold</Th>
          <Th className="text-right">Revenue</Th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.productId}>
            <Td className="font-medium text-slate-900">{product.name}</Td>
            <Td className="text-right tabular-nums">{product.quantitySold}</Td>
            <Td className="text-right font-semibold">
              <Price value={product.revenue} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
