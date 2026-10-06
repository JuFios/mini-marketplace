import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import { SalesReportService } from './sales-report.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsRepository, AnalyticsService, SalesReportService],
})
export class AnalyticsModule {}
