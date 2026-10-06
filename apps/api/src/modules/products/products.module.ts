import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfigService } from '../../config/app-config.service';
import { CatalogCacheModule } from '../catalog-cache/catalog-cache.module';
import { CategoriesModule } from '../categories/categories.module';
import { AdminProductsController } from './admin-products.controller';
import { CatalogService } from './catalog.service';
import { ProductImagesService } from './product-images.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

@Module({
  imports: [
    CategoriesModule,
    CatalogCacheModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      // Files are kept in memory (the content is inspected before anything is written to disk)
      // and capped, so an oversized upload is rejected while streaming.
      useFactory: (config: AppConfigService) => ({
        limits: { fileSize: config.uploadMaxBytes, files: 1 },
      }),
    }),
  ],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsRepository, ProductsService, ProductImagesService, CatalogService],
  exports: [ProductsService],
})
export class ProductsModule {}
