import { createValidationPipe } from '../../../common/pipes/validation.pipe';
import { DateRangeQueryDto } from './date-range-query.dto';

async function parse(query: Record<string, unknown>): Promise<DateRangeQueryDto | string[]> {
  try {
    return (await createValidationPipe().transform(query, {
      type: 'query',
      metatype: DateRangeQueryDto,
    })) as DateRangeQueryDto;
  } catch (error) {
    return (error as { details: { field: string }[] }).details.map((d) => d.field);
  }
}

describe('DateRangeQueryDto', () => {
  it('accepts no parameters, either one, or both', async () => {
    expect(await parse({})).toBeInstanceOf(DateRangeQueryDto);
    expect(await parse({ from: '2026-10-01' })).toMatchObject({ from: '2026-10-01' });
    expect(await parse({ to: '2026-10-05' })).toMatchObject({ to: '2026-10-05' });
    expect(await parse({ from: '2026-10-01', to: '2026-10-05' })).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-05',
    });
  });

  it.each([
    [{ from: '2026-02-30' }, 'from'],
    [{ from: '2026-10-01T00:00:00Z' }, 'from'],
    [{ from: '1.10.2026' }, 'from'],
    [{ to: 'yesterday' }, 'to'],
    [{ to: '' }, 'to'],
    [{ unknown: '1' }, 'unknown'],
    [{ page: '2' }, 'page'],
  ])('rejects %j', async (query, field) => {
    expect(await parse(query)).toEqual([field]);
  });
});
