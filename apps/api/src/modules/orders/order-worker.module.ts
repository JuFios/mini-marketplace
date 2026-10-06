import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrderProcessingService } from './order-processing.service';
import { OrdersCoreModule } from './orders-core.module';
import { OrderProcessingProcessor } from './queue/order-processing.processor';
import { OrdersQueueModule } from './queue/orders-queue.module';
import { StaleOrderSweeper } from './queue/stale-order.sweeper';

/**
 * Everything that consumes the `orders` queue. Only the worker process loads it (and the e2e
 * suite, to run the worker in-process): the API merely adds jobs, so it must not process any.
 */
@Module({
  imports: [OrdersCoreModule, OrdersQueueModule, PaymentsModule],
  providers: [OrderProcessingService, StaleOrderSweeper, OrderProcessingProcessor],
})
export class OrderWorkerModule {}
