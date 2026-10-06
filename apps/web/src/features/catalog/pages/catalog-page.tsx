import { useAddToCart } from '@/features/cart/use-add-to-cart';
import { useExternalNavigationKey } from '@/shared/hooks/use-external-navigation-key';
import { cn } from '@/shared/lib/cn';
import { Button, EmptyState, Pagination, QueryBoundary } from '@/shared/ui';
import { FiltersBar } from '../components/filters-bar';
import { ProductGrid, ProductGridSkeleton } from '../components/product-grid';
import { hasActiveFilters } from '../filters';
import { useCategoriesQuery, useProductsQuery } from '../queries';
import { useCatalogFilters } from '../use-catalog-filters';

export function CatalogPage() {
  const { filters, update, reset } = useCatalogFilters();
  const products = useProductsQuery(filters);
  const categories = useCategoriesQuery();
  const { addToCart, canShop } = useAddToCart();
  // The text fields start over from the URL after back/forward or a link, never while typing.
  const filtersKey = useExternalNavigationKey();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Products</h1>
      <FiltersBar
        key={filtersKey}
        filters={filters}
        categories={categories.data}
        onChange={update}
        onReset={reset}
        isFiltered={hasActiveFilters(filters)}
      />
      <QueryBoundary
        query={products}
        isEmpty={(data) => data.items.length === 0}
        loading={<ProductGridSkeleton />}
        empty={
          <EmptyState
            title="No products found"
            description="Try a different search or fewer filters."
            action={
              <Button variant="secondary" onClick={reset}>
                Reset filters
              </Button>
            }
          />
        }
      >
        {(data) => (
          // While the next page loads, the previous one stays, dimmed.
          <div className={cn('space-y-6', products.isPlaceholderData && 'opacity-60')}>
            <p className="text-sm text-slate-600" aria-live="polite">
              {data.meta.total} {data.meta.total === 1 ? 'product' : 'products'}
            </p>
            <ProductGrid
              products={data.items}
              {...(canShop && { onAddToCart: (product) => addToCart(product) })}
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
      </QueryBoundary>
    </div>
  );
}
