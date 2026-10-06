import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CategoryResponse } from './dto/category.response.dto';

@ApiTags('categories')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'All categories, sorted by name' })
  list(): Promise<CategoryResponse[]> {
    return this.categories.list();
  }
}
