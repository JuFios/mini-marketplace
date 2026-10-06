import { Module } from '@nestjs/common';
import { CatalogCacheModule } from '../catalog-cache/catalog-cache.module';
import { InventoryRepository } from './inventory.repository';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

/**
 * What both the API and the worker need to read and change orders: no controllers, no HTTP
 * concerns, so the worker process can load it without the rest of the shop.
 */
@Module({
  imports: [CatalogCacheModule],
  providers: [OrdersRepository, InventoryRepository, OrdersService, OrderLifecycleService],
  exports: [OrdersRepository, InventoryRepository, OrdersService, OrderLifecycleService],
})
export class OrdersCoreModule {}
