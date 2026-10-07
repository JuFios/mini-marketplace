import { Link } from 'react-router';
import type { AdminProduct } from '@/shared/api/types';
import { Badge, Button, Price, Table, Td, Th, Thumbnail } from '@/shared/ui';

export interface ProductsTableProps {
  products: AdminProduct[];
  onAdjustStock: (product: AdminProduct) => void;
  onArchive: (product: AdminProduct) => void;
  onRestore: (product: AdminProduct) => void;
}

export function ProductsTable({
  products,
  onAdjustStock,
  onArchive,
  onRestore,
}: ProductsTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Product</Th>
          <Th>Price</Th>
          <Th>Stock</Th>
          <Th>Status</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const archived = product.deletedAt !== null;
          return (
            <tr key={product.id}>
              <Td>
                <div className="flex items-center gap-3">
                  <Thumbnail
                    src={product.imageUrl}
                    alt={product.name}
                    className="size-10 shrink-0 rounded"
                  />
                  <div className="min-w-0">
                    <p className="max-w-xs truncate font-medium text-slate-900">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.category.name}</p>
                  </div>
                </div>
              </Td>
              <Td>
                <Price value={product.price} />
              </Td>
              <Td className="tabular-nums">{product.stock}</Td>
              <Td>
                <Badge tone={archived ? 'neutral' : 'success'}>
                  {archived ? 'Archived' : 'Active'}
                </Badge>
              </Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <Link
                    to={`/admin/products/${product.id}/edit`}
                    aria-label={`Edit ${product.name}`}
                    className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Edit
                  </Link>
                  {archived ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Restore ${product.name}`}
                      onClick={() => onRestore(product)}
                    >
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Adjust stock of ${product.name}`}
                        onClick={() => onAdjustStock(product)}
                      >
                        Adjust stock
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Archive ${product.name}`}
                        onClick={() => onArchive(product)}
                      >
                        Archive
                      </Button>
                    </>
                  )}
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
