import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../../common/validators/calendar-date.validators';

/**
 * `from` and `to` as `YYYY-MM-DD` (UTC, both included). Their relation and the defaults are
 * handled by `resolveDateRange`, which also knows what "today" is.
 */
export class DateRangeQueryDto {
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
