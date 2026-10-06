import { createValidationPipe } from '../../../common/pipes/validation.pipe';
import { ChangeOrderStatusDto } from './change-order-status.dto';
import { AdminOrderQueryDto, OrderQueryDto } from './order-query.dto';

async function parse<T extends object>(
  metatype: new () => T,
  type: 'query' | 'body',
  value: Record<string, unknown>,
): Promise<T | string[]> {
  try {
    return (await createValidationPipe().transform(value, { type, metatype })) as T;
  } catch (error) {
    return (error as { details: { field: string }[] }).details.map((d) => d.field);
  }
}

describe('OrderQueryDto', () => {
  const parseQuery = (query: Record<string, unknown>) => parse(OrderQueryDto, 'query', query);

  it('applies the pagination defaults', async () => {
    expect(await parseQuery({})).toMatchObject({ page: 1, limit: 20 });
  });

  it('accepts every order status', async () => {
    for (const status of ['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED']) {
      expect(await parseQuery({ status })).toMatchObject({ status });
    }
  });

  it.each([
    [{ status: 'new' }, 'status'],
    [{ status: 'DELIVERED' }, 'status'],
    [{ limit: '101' }, 'limit'],
    [{ page: '0' }, 'page'],
    // Filters of the administrators' list are not accepted on the customer's own history.
    [{ customerEmail: 'ann@example.com' }, 'customerEmail'],
    [{ from: '2026-10-01' }, 'from'],
    [{ unknown: '1' }, 'unknown'],
  ])('rejects %j', async (query, field) => {
    expect(await parseQuery(query)).toEqual([field]);
  });
});

describe('AdminOrderQueryDto', () => {
  const parseQuery = (query: Record<string, unknown>) => parse(AdminOrderQueryDto, 'query', query);

  it('accepts all filters together, trimming the email part', async () => {
    expect(
      await parseQuery({
        status: 'SHIPPED',
        from: '2026-10-01',
        to: '2026-10-31',
        customerEmail: '  ann@  ',
        page: '2',
        limit: '50',
      }),
    ).toMatchObject({
      status: 'SHIPPED',
      from: '2026-10-01',
      to: '2026-10-31',
      customerEmail: 'ann@',
      page: 2,
      limit: 50,
    });
  });

  it('accepts a single day and a leap day', async () => {
    expect(await parseQuery({ from: '2026-10-05', to: '2026-10-05' })).toMatchObject({
      from: '2026-10-05',
    });
    expect(await parseQuery({ from: '2028-02-29' })).toMatchObject({ from: '2028-02-29' });
  });

  it('rejects `to` earlier than `from`, naming `to`', async () => {
    expect(await parseQuery({ from: '2026-10-05', to: '2026-10-04' })).toEqual(['to']);
  });

  it.each([
    [{ from: '2026-02-30' }, 'from'],
    [{ from: '2027-02-29' }, 'from'],
    [{ from: '2026-13-01' }, 'from'],
    [{ from: '2026-1-1' }, 'from'],
    [{ from: '2026-10-01T00:00:00Z' }, 'from'],
    [{ from: '01/10/2026' }, 'from'],
    [{ to: 'tomorrow' }, 'to'],
    [{ customerEmail: '' }, 'customerEmail'],
    [{ customerEmail: 'a'.repeat(255) }, 'customerEmail'],
    [{ status: 'LOST' }, 'status'],
  ])('rejects %j', async (query, field) => {
    expect(await parseQuery(query)).toEqual([field]);
  });
});

describe('ChangeOrderStatusDto', () => {
  const parseBody = (body: Record<string, unknown>) => parse(ChangeOrderStatusDto, 'body', body);

  it('accepts any known status: the state machine, not validation, decides what is allowed', async () => {
    for (const status of ['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED']) {
      expect(await parseBody({ status })).toMatchObject({ status });
    }
  });

  it.each([
    [{}, 'status'],
    [{ status: 'shipped' }, 'status'],
    [{ status: 'DELIVERED' }, 'status'],
    [{ status: 1 }, 'status'],
    [{ status: 'SHIPPED', cancelReason: 'ADMIN_ACTION' }, 'cancelReason'],
  ])('rejects %j', async (body, field) => {
    expect(await parseBody(body)).toEqual([field]);
  });
});
