import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { SalesByDayResponse, SummaryResponse } from './dto/analytics.response.dto';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { SalesReportService } from './sales-report.service';

// Shown on every endpoint: all three count the same sales, and the basis is easy to misread.
const SALES_BASIS =
  'A sale is an order that is PROCESSING, SHIPPED or COMPLETED, counted on the UTC day the order was placed. ' +
  'An order cancelled later drops out of its day, so figures for past days can go down.';

@ApiTags('admin-analytics')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly report: SalesReportService,
    private readonly logger: PinoLogger,
  ) {
    // See AuthService: `@InjectPinoLogger` would make module import order significant.
    this.logger.setContext(AnalyticsController.name);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Revenue, orders, average order value and the top 5 products',
    description: SALES_BASIS,
  })
  summary(@Query() query: DateRangeQueryDto): Promise<SummaryResponse> {
    return this.analytics.summary(query);
  }

  @Get('sales-by-day')
  @ApiOperation({
    summary: 'Revenue and orders per UTC day; days without sales are included',
    description: SALES_BASIS,
  })
  salesByDay(@Query() query: DateRangeQueryDto): Promise<SalesByDayResponse> {
    return this.analytics.salesByDay(query);
  }

  // Declared with a literal path; Nest serves the file as it is produced, without buffering it.
  @Get('sales-report.csv')
  @ApiOperation({
    summary: 'Download the sales of the range as CSV, one row per order line',
    description: SALES_BASIS,
  })
  @ApiProduces('text/csv')
  async salesReport(@Query() query: DateRangeQueryDto): Promise<StreamableFile> {
    const { filename, stream } = await this.report.open(query);
    return new StreamableFile(stream, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    }).setErrorHandler((error, response) => {
      // A batch after the first failed while the file was being sent. The status line left with
      // the first bytes, so the exception filter cannot answer any more, and Nest's default
      // handler would end the response normally: the client would save a shorter file that looks
      // complete, and nothing would be logged. Dropping the connection makes the download fail.
      this.logger.error({ event: 'analytics.report_failed', err: error }, 'Sales report aborted');
      // Typed loosely by Nest; it is Node's response, which can drop its connection.
      (response as typeof response & { destroy(): void }).destroy();
    });
  }
}
