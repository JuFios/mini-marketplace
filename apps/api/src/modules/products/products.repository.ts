import { Injectable } from '@nestjs/common';
import { escapeLike } from '../../common/prisma/escape-like';
import { whereLive } from '../../common/prisma/where-live';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { ProductStatusFilter } from './dto/admin-product-query.dto';
import type { ProductWithCategory } from './mappers/to-product-response';

const WITH_CATEGORY = { category: { select: { id: true, name: true } } } as const;

export interface AdminProductFilter {
  search?: string;
  categoryId?: string;
  status: ProductStatusFilter;
}

export interface CreateProductData {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  stock: number;
  imageUrl?: string;
}

export interface UpdateProductData {
  name?: string;
  description?: string;
  price?: string;
  categoryId?: string;
  imageUrl?: string | null;
}

function toWhere({ search, categoryId, status }: AdminProductFilter): Prisma.ProductWhereInput {
  return {
    ...(status === 'active' && whereLive()),
    ...(status === 'archived' && { deletedAt: { not: null } }),
    ...(categoryId && { categoryId }),
    ...(search && { name: { contains: escapeLike(search), mode: 'insensitive' } }),
  };
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    filter: AdminProductFilter,
    skip: number,
    take: number,
  ): Promise<{ items: ProductWithCategory[]; total: number }> {
    const where = toWhere(filter);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: WITH_CATEGORY,
        // `id` makes the order total, so pages never overlap or skip rows.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<ProductWithCategory | null> {
    return this.prisma.product.findUnique({ where: { id }, include: WITH_CATEGORY });
  }

  create(data: CreateProductData): Promise<ProductWithCategory> {
    return this.prisma.product.create({ data, include: WITH_CATEGORY });
  }

  update(id: string, data: UpdateProductData): Promise<ProductWithCategory> {
    return this.prisma.product.update({ where: { id }, data, include: WITH_CATEGORY });
  }

  /** Archives a live product; returns false when it was already archived or does not exist. */
  async archive(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.product.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: now },
    });
    return count === 1;
  }

  restore(id: string): Promise<ProductWithCategory> {
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: null },
      include: WITH_CATEGORY,
    });
  }

  findStockState(id: string): Promise<{ stock: number; deletedAt: Date | null } | null> {
    return this.prisma.product.findUnique({
      where: { id },
      select: { stock: true, deletedAt: true },
    });
  }

  /**
   * Changes stock by `delta` and returns the new value, or `null` when nothing was updated
   * (product missing, archived, or the result would be negative).
   *
   * Concurrency: the check (`stock + delta >= 0`) and the write are one statement. The row lock
   * taken by UPDATE makes a concurrent adjustment wait, and PostgreSQL re-evaluates the WHERE
   * clause against the freshly committed row afterwards, so no adjustment is ever lost and stock
   * can never go below zero. The value is relative on purpose: an absolute "set stock to N" would
   * overwrite units sold between reading and writing.
   */
  async adjustStock(id: string, delta: number): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ stock: number }[]>`
      UPDATE products
      SET stock = stock + ${delta}::int, updated_at = now()
      WHERE id = ${id}::uuid AND deleted_at IS NULL AND stock + ${delta}::int >= 0
      RETURNING stock`;
    return rows.length === 1 ? rows[0].stock : null;
  }
}
