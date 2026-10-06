import { Injectable } from '@nestjs/common';
import { whereLive } from '../../common/prisma/where-live';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { CategoryWithCount } from './mappers/to-category-response';

// Counts only live products: archived ones must not inflate what customers see.
const WITH_LIVE_PRODUCT_COUNT = {
  _count: { select: { products: { where: whereLive() } } },
} as const;

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<CategoryWithCount[]> {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: WITH_LIVE_PRODUCT_COUNT,
    });
  }

  findById(id: string): Promise<CategoryWithCount | null> {
    return this.prisma.category.findUnique({ where: { id }, include: WITH_LIVE_PRODUCT_COUNT });
  }

  create(name: string): Promise<CategoryWithCount> {
    return this.prisma.category.create({ data: { name }, include: WITH_LIVE_PRODUCT_COUNT });
  }

  update(id: string, name: string): Promise<CategoryWithCount> {
    return this.prisma.category.update({
      where: { id },
      data: { name },
      include: WITH_LIVE_PRODUCT_COUNT,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }
}
