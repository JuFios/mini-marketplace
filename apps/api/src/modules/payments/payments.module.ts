import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { MockPaymentProvider } from './mock-payment-provider';
import { PAYMENT_PROVIDER } from './payment-provider';

@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new MockPaymentProvider({
          failureRate: config.paymentMockFailureRate,
          delayMs: config.paymentMockDelayMs,
        }),
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
