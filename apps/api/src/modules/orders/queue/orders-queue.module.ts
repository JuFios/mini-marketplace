import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { logQueueErrors } from '../../../infra/queue/queue-error-logging';
import { ORDERS_QUEUE } from './order-queue.constants';

/** The `orders` queue, shared by whoever adds jobs (the API) and whoever inspects them (the worker). */
@Module({
  imports: [BullModule.registerQueue({ name: ORDERS_QUEUE })],
  providers: [logQueueErrors(ORDERS_QUEUE, 'orders.queue_error')],
  exports: [BullModule],
})
export class OrdersQueueModule {}
