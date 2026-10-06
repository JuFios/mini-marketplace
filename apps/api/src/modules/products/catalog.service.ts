import { Injectable } from '@nestjs/common';
import { ResourceNotFoundException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { Paginated, paginated } from '../../common/pagination/pagination.dto';
import { productKeySuffix, productListKeySuffix } from '../catalog-cache/catalog-cache.keys';
import { CatalogCacheService } from '../catalog-cache/catalog-cache.service';
import { normalizeProductListQuery } from './catalog-query';
import type { ProductQueryDto } from './dto/product-query.dto';
import type { ProductResponse } from './dto/product.response.dto';
import { toProductResponse } from './mappers/to-product-response';
import { ProductsRepository } from './products.repository';

/** Read side of the public catalog: live products only, served through the cache. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly cache: CatalogCacheService,
  ) {}

  list(query: ProductQueryDto): Promise<Paginated<ProductResponse>> {
    const normalized = normalizeProductListQuery(query);
    return this.cache.remember(productListKeySuffix(normalized), async () => {
      const { items, total } = await this.products.findLivePage(
        normalized,
        query.sort,
        (normalized.page - 1) * normalized.limit,
        normalized.limit,
      );
      return paginated(items.map(toProductResponse), total, normalized.page, normalized.limit);
    });
  }

  get(id: string): Promise<ProductResponse> {
    return this.cache.remember(productKeySuffix(id), async () => {
      const product = await this.products.findLiveById(id);
      // Not found is thrown, hence never cached: an archived product is simply a 404.
      if (!product) {
        throw new ResourceNotFoundException('Product not found', ErrorCode.PRODUCT_NOT_FOUND);
      }
      return toProductResponse(product);
    });
  }
}
