import { Injectable } from '@nestjs/common';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import {
  isForeignKeyViolation,
  isRecordNotFound,
  isUniqueViolation,
} from '../../common/filters/database-error';
import { CategoriesRepository } from './categories.repository';
import type { CategoryResponse } from './dto/category.response.dto';
import { toCategoryResponse } from './mappers/to-category-response';

const notFound = (): ResourceNotFoundException =>
  new ResourceNotFoundException('Category not found', ErrorCode.CATEGORY_NOT_FOUND);

const nameTaken = (): ResourceConflictException =>
  new ResourceConflictException(
    'A category with this name already exists',
    ErrorCode.CATEGORY_NAME_TAKEN,
  );

@Injectable()
export class CategoriesService {
  constructor(private readonly categories: CategoriesRepository) {}

  async list(): Promise<CategoryResponse[]> {
    return (await this.categories.findAll()).map(toCategoryResponse);
  }

  /** Used by other modules before they reference a category. */
  async assertExists(id: string): Promise<void> {
    if (!(await this.categories.findById(id))) throw notFound();
  }

  async create(name: string): Promise<CategoryResponse> {
    try {
      return toCategoryResponse(await this.categories.create(name));
    } catch (error) {
      // The unique index decides: two concurrent requests both pass any "exists?" pre-check.
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async rename(id: string, name: string): Promise<CategoryResponse> {
    try {
      return toCategoryResponse(await this.categories.update(id, name));
    } catch (error) {
      if (isRecordNotFound(error)) throw notFound();
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.categories.delete(id);
    } catch (error) {
      if (isRecordNotFound(error)) throw notFound();
      // RESTRICT on products.category_id: archived products count as "in use" too.
      if (isForeignKeyViolation(error)) {
        throw new ResourceConflictException(
          'The category still has products',
          ErrorCode.CATEGORY_IN_USE,
        );
      }
      throw error;
    }
  }
}
