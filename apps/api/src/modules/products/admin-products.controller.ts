import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { API_PREFIX } from '../../common/api-prefix';
import { Paginated } from '../../common/pagination/pagination.dto';
import { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminProductQueryDto } from './dto/admin-product-query.dto';
import { CreateProductDto, MAX_STOCK } from './dto/create-product.dto';
import {
  AdminProductResponse,
  ImageUploadResponse,
  StockAdjustmentResponse,
} from './dto/product.response.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductImagesService } from './product-images.service';
import { ProductsService } from './products.service';

@ApiTags('admin-products')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly images: ProductImagesService,
  ) {}

  // Declared before the `:id` routes so that "images" is never read as an id.
  @Post('images')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a product image (PNG, JPEG or WebP, up to 2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  uploadImage(@UploadedFile() file: Express.Multer.File | undefined): Promise<ImageUploadResponse> {
    return this.images.upload(file);
  }

  @Get()
  @ApiOperation({ summary: 'List products, archived ones included unless filtered out' })
  list(@Query() query: AdminProductQueryDto): Promise<Paginated<AdminProductResponse>> {
    return this.products.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A product, archived or not' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminProductResponse> {
    return this.products.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product with its initial stock' })
  async create(
    @Body() dto: CreateProductDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminProductResponse> {
    const product = await this.products.create(dto);
    response.location(`/${API_PREFIX}/admin/products/${product.id}`);
    return product;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a product; stock is changed only through adjustments' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<AdminProductResponse> {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a product (soft delete)' })
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.products.archive(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Un-archive a product' })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<AdminProductResponse> {
    return this.products.restore(id);
  }

  @Post(':id/stock-adjustments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add or remove units atomically; stock never goes below zero',
    description: `Refused with 400 on delta if an addition would take stock past ${MAX_STOCK}.`,
  })
  adjustStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockAdjustmentDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<StockAdjustmentResponse> {
    return this.products.adjustStock(id, dto, admin.id);
  }
}
