import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        // The pg driver waits forever by default; a saturated pool must fail the request
        // quickly instead of hanging it.
        connectionTimeoutMillis: 5_000,
      }),
      // Failed queries are logged, and the default error text embeds the query arguments
      // (emails, password hashes): keep it to the bare message.
      errorFormat: 'minimal',
      // Defaults for every interactive transaction. A lock wait longer than `timeout` means
      // something is wrong; failing is better than holding row locks for long.
      transactionOptions: { maxWait: 5_000, timeout: 10_000 },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
