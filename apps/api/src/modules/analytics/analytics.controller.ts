import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { SalesByDayResponse, SummaryResponse } from './dto/analytics.response.dto';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { SalesReportService } from './sales-report.service';

@ApiTags('admin-analytics')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly report: SalesReportService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Revenue, orders, average order value and the top 5 products' })
  summary(@Query() query: DateRangeQueryDto): Promise<SummaryResponse> {
    return this.analytics.summary(query);
  }

  @Get('sales-by-day')
  @ApiOperation({ summary: 'Revenue and orders per UTC day; days without sales are included' })
  salesByDay(@Query() query: DateRangeQueryDto): Promise<SalesByDayResponse> {
    return this.analytics.salesByDay(query);
  }

  // Declared with a literal path; Nest serves the file as it is produced, without buffering it.
  @Get('sales-report.csv')
  @ApiOperation({ summary: 'Download the sales of the range as CSV, one row per order line' })
  @ApiProduces('text/csv')
  async salesReport(@Query() query: DateRangeQueryDto): Promise<StreamableFile> {
    const { filename, stream } = await this.report.open(query);
    return new StreamableFile(stream, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
