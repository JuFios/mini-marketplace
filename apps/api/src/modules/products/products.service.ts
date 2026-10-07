import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  InsufficientStockException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationFailedException,
} from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { isRecordNotFound } from '../../common/filters/database-error';
import { Paginated, pageOffset, paginated } from '../../common/pagination/pagination.dto';
import { CatalogCacheService } from '../catalog-cache/catalog-cache.service';
import { CategoriesService } from '../categories/categories.service';
import type { AdminProductQueryDto } from './dto/admin-product-query.dto';
import { type CreateProductDto, MAX_STOCK } from './dto/create-product.dto';
import type { AdminProductResponse, StockAdjustmentResponse } from './dto/product.response.dto';
import type { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import { toAdminProductResponse } from './mappers/to-product-response';
import { ProductsRepository } from './products.repository';

const notFound = (): ResourceNotFoundException =>
  new ResourceNotFoundException('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly categories: CategoriesService,
    private readonly catalogCache: CatalogCacheService,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(ProductsService.name);
  }

  async list(query: AdminProductQueryDto): Promise<Paginated<AdminProductResponse>> {
    const { skip, take } = pageOffset(query);
    const { items, total } = await this.products.findPage(
      { search: query.search, categoryId: query.categoryId, status: query.status },
      skip,
      take,
    );
    return paginated(items.map(toAdminProductResponse), total, query.page, query.limit);
  }

  /** Minimal facts other modules (the cart) need before they accept a product. */
  async getAvailability(id: string): Promise<{ stock: number; isArchived: boolean } | null> {
    const state = await this.products.findStockState(id);
    return state && { stock: state.stock, isArchived: state.deletedAt !== null };
  }

  async get(id: string): Promise<AdminProductResponse> {
    const product = await this.products.findById(id);
    if (!product) throw notFound();
    return toAdminProductResponse(product);
  }

  async create(dto: CreateProductDto): Promise<AdminProductResponse> {
    await this.categories.assertExists(dto.categoryId);
    const product = await this.products.create(dto);
    await this.catalogCache.invalidate();
    return toAdminProductResponse(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<AdminProductResponse> {
    if (dto.categoryId) await this.categories.assertExists(dto.categoryId);
    let product;
    try {
      product = await this.products.update(id, dto);
    } catch (error) {
      if (isRecordNotFound(error)) throw notFound();
      throw error;
    }
    await this.catalogCache.invalidate();
    return toAdminProductResponse(product);
  }

  /** Soft delete. Idempotent: archiving an archived product is not an error. */
  async archive(id: string): Promise<void> {
    if (await this.products.archive(id, new Date())) {
      await this.catalogCache.invalidate();
      return;
    }
    if (!(await this.products.findStockState(id))) throw notFound();
  }

  async restore(id: string): Promise<AdminProductResponse> {
    let product;
    try {
      product = await this.products.restore(id);
    } catch (error) {
      if (isRecordNotFound(error)) throw notFound();
      throw error;
    }
    await this.catalogCache.invalidate();
    return toAdminProductResponse(product);
  }

  async adjustStock(
    id: string,
    dto: StockAdjustmentDto,
    adminId: string,
  ): Promise<StockAdjustmentResponse> {
    const stock = await this.products.adjustStock(id, dto.delta);
    if (stock === null) throw await this.explainRejectedAdjustment(id, dto.delta);
    // Stock is part of the cached product, so a committed change must drop the cache.
    await this.catalogCache.invalidate();

    this.logger.info(
      {
        event: 'stock.adjusted',
        productId: id,
        delta: dto.delta,
        stock,
        reason: dto.reason,
        adminId,
      },
      'Stock adjusted',
    );
    return { id, stock };
  }

  /** The atomic UPDATE only says "no row"; look at the product to tell the client why. */
  private async explainRejectedAdjustment(
    id: string,
    delta: number,
  ): Promise<
    | ResourceNotFoundException
    | ResourceConflictException
    | ValidationFailedException
    | InsufficientStockException
  > {
    const state = await this.products.findStockState(id);
    if (!state) return notFound();
    if (state.deletedAt) {
      return new ResourceConflictException(
        'The product is archived; restore it before adjusting stock',
        ErrorCode.PRODUCT_UNAVAILABLE,
      );
    }
    // For a live product an addition fails only on the limit and a removal only on zero, so the
    // sign tells which, even when the stock has changed since the UPDATE.
    if (delta > 0) {
      return new ValidationFailedException([
        {
          field: 'delta',
          messages: [`Stock cannot go above ${MAX_STOCK} (current stock: ${state.stock})`],
        },
      ]);
    }
    return new InsufficientStockException('Stock cannot go below zero', [
      { productId: id, requested: delta, available: state.stock },
    ]);
  }
}
