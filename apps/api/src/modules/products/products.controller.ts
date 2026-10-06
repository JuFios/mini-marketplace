import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../../common/pagination/pagination.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductResponse } from './dto/product.response.dto';

@ApiTags('products')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter the catalog (archived products never appear)' })
  list(@Query() query: ProductQueryDto): Promise<Paginated<ProductResponse>> {
    return this.catalog.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A product; 404 when missing or archived' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.catalog.get(id);
  }
}
