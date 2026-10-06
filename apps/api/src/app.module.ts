import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './infra/health/health.module';
import { AppLoggerModule } from './infra/logger/logger.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { SecurityModule } from './infra/security/security.module';
import { StorageModule } from './infra/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    CommonModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    HealthModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    SecurityModule,
  ],
})
export class AppModule {}
