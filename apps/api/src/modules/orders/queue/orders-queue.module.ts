import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ORDERS_QUEUE } from './order-queue.constants';

/** The `orders` queue, shared by whoever adds jobs (the API) and whoever inspects them (the worker). */
@Module({
  imports: [BullModule.registerQueue({ name: ORDERS_QUEUE })],
  exports: [BullModule],
})
export class OrdersQueueModule {}
