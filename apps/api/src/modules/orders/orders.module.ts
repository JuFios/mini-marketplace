import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CatalogCacheModule } from '../catalog-cache/catalog-cache.module';
import { CheckoutService } from './checkout.service';
import { InventoryRepository } from './inventory.repository';
import { NoopOrderEventsPublisher, ORDER_EVENTS_PUBLISHER } from './order-events.publisher';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, CatalogCacheModule],
  controllers: [OrdersController],
  providers: [
    OrdersRepository,
    InventoryRepository,
    OrdersService,
    CheckoutService,
    { provide: ORDER_EVENTS_PUBLISHER, useClass: NoopOrderEventsPublisher },
  ],
})
export class OrdersModule {}
