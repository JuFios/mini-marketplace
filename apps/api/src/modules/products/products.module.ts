import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfigService } from '../../config/app-config.service';
import { CategoriesModule } from '../categories/categories.module';
import { AdminProductsController } from './admin-products.controller';
import { ProductImagesService } from './product-images.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

@Module({
  imports: [
    CategoriesModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      // Files are kept in memory (the content is inspected before anything is written to disk)
      // and capped, so an oversized upload is rejected while streaming.
      useFactory: (config: AppConfigService) => ({
        limits: { fileSize: config.uploadMaxBytes, files: 1 },
      }),
    }),
  ],
  controllers: [AdminProductsController],
  providers: [ProductsRepository, ProductsService, ProductImagesService],
  exports: [ProductsService],
})
export class ProductsModule {}
