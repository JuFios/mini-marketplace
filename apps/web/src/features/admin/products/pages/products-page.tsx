import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useCategoriesQuery } from '@/features/catalog/queries';
import { useExternalNavigationKey } from '@/shared/hooks/use-external-navigation-key';
import type { AdminProduct } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  PagedQueryBoundary,
  Pagination,
  buttonStyles,
} from '@/shared/ui';
import { ProductsFilters } from '../components/products-filters';
import { ProductsTable } from '../components/products-table';
import { StockAdjustDialog } from '../components/stock-adjust-dialog';
import { hasActiveFilters } from '../filters';
import {
  useAdjustStock,
  useAdminProductsQuery,
  useArchiveProduct,
  useRestoreProduct,
} from '../queries';
import { useProductFilters } from '../use-product-filters';

export function ProductsPage() {
  const { filters, update, reset } = useProductFilters();
  const products = useAdminProductsQuery(filters);
  const categories = useCategoriesQuery();
  const adjustStock = useAdjustStock();
  const archive = useArchiveProduct();
  const restore = useRestoreProduct();
  const filtersKey = useExternalNavigationKey();
  const [adjusting, setAdjusting] = useState<AdminProduct | null>(null);
  const [archiving, setArchiving] = useState<AdminProduct | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <Link to="/admin/products/new" className={buttonStyles('primary')}>
          New product
        </Link>
      </div>
      <ProductsFilters
        key={filtersKey}
        filters={filters}
        categories={categories.data}
        onChange={update}
        onReset={reset}
        isFiltered={hasActiveFilters(filters)}
      />
      <PagedQueryBoundary
        query={products}
        onFirstPage={() => update({ page: 1 })}
        empty={
          hasActiveFilters(filters) ? (
            <EmptyState
              title="No products found"
              description="Try a different search or fewer filters."
              action={
                <Button variant="secondary" onClick={reset}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No products yet"
              description="Create the first one to fill the shop."
              action={
                <Link to="/admin/products/new" className={buttonStyles('primary')}>
                  New product
                </Link>
              }
            />
          )
        }
      >
        {(data) => (
          <div className={cn('space-y-4', products.isPlaceholderData && 'opacity-60')}>
            <p className="text-sm text-slate-600" aria-live="polite">
              {data.meta.total} {data.meta.total === 1 ? 'product' : 'products'}
            </p>
            <ProductsTable
              products={data.items}
              onAdjustStock={setAdjusting}
              onArchive={setArchiving}
              onRestore={(product) => restore.mutate(product)}
            />
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onPageChange={(page) => {
                update({ page }, { push: true });
                window.scrollTo({ top: 0 });
              }}
              className="justify-center"
            />
          </div>
        )}
      </PagedQueryBoundary>

      <StockAdjustDialog
        product={adjusting}
        onClose={() => setAdjusting(null)}
        onSubmit={async (delta, reason) => {
          if (!adjusting) return;
          const result = await adjustStock.mutateAsync({
            id: adjusting.id,
            delta,
            ...(reason && { reason }),
          });
          toast.success(`Stock of “${adjusting.name}” is now ${result.stock}`);
          setAdjusting(null);
        }}
      />
      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (archiving) archive.mutate(archiving);
        }}
        title="Archive this product?"
        confirmLabel="Archive"
        cancelLabel="Keep it"
      >
        {archiving && (
          <>
            “{archiving.name}” disappears from the shop, and carts that still hold it cannot check
            out until it is removed. You can restore it later.
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
