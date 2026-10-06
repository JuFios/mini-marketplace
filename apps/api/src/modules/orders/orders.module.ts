import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CatalogCacheModule } from '../catalog-cache/catalog-cache.module';
import { AdminOrdersController } from './admin-orders.controller';
import { CheckoutService } from './checkout.service';
import { ORDER_EVENTS_PUBLISHER } from './order-events.publisher';
import { OrdersController } from './orders.controller';
import { OrdersCoreModule } from './orders-core.module';
import { OrderProcessingProducer } from './queue/order-processing.producer';
import { OrdersQueueModule } from './queue/orders-queue.module';

@Module({
  imports: [CartModule, CatalogCacheModule, OrdersCoreModule, OrdersQueueModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [
    CheckoutService,
    { provide: ORDER_EVENTS_PUBLISHER, useClass: OrderProcessingProducer },
  ],
})
export class OrdersModule {}
