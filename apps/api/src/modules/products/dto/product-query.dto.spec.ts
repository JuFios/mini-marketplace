import { createValidationPipe } from '../../../common/pipes/validation.pipe';
import { ProductQueryDto } from './product-query.dto';

async function parse(query: Record<string, unknown>): Promise<ProductQueryDto | string[]> {
  try {
    return (await createValidationPipe().transform(query, {
      type: 'query',
      metatype: ProductQueryDto,
    })) as ProductQueryDto;
  } catch (error) {
    return (error as { details: { field: string }[] }).details.map((d) => d.field);
  }
}

describe('ProductQueryDto', () => {
  it('applies defaults', async () => {
    expect(await parse({})).toMatchObject({ page: 1, limit: 20, sort: 'newest' });
  });

  it('parses numbers and booleans from query strings', async () => {
    const dto = (await parse({ page: '2', limit: '5', inStock: 'true' })) as ProductQueryDto;

    expect(dto).toMatchObject({ page: 2, limit: 5, inStock: true });
    expect(((await parse({ inStock: 'false' })) as ProductQueryDto).inStock).toBe(false);
  });

  it('accepts equal bounds, zero and the maximum', async () => {
    expect(await parse({ minPrice: '10', maxPrice: '10' })).toBeInstanceOf(ProductQueryDto);
    expect(await parse({ minPrice: '0' })).toBeInstanceOf(ProductQueryDto);
    expect(await parse({ maxPrice: '1000000.00' })).toBeInstanceOf(ProductQueryDto);
  });

  it('rejects minPrice greater than maxPrice, naming maxPrice', async () => {
    expect(await parse({ minPrice: '20', maxPrice: '10.50' })).toEqual(['maxPrice']);
  });

  it.each([
    [{ minPrice: '-1' }, 'minPrice'],
    [{ minPrice: 'abc' }, 'minPrice'],
    [{ maxPrice: '1.999' }, 'maxPrice'],
    [{ maxPrice: '1000000.01' }, 'maxPrice'],
    [{ sort: 'cheapest' }, 'sort'],
    [{ inStock: 'yes' }, 'inStock'],
    [{ inStock: '1' }, 'inStock'],
    [{ limit: '101' }, 'limit'],
    [{ page: '0' }, 'page'],
    [{ categoryId: 'x' }, 'categoryId'],
    [{ search: '' }, 'search'],
    [{ unknown: '1' }, 'unknown'],
  ])('rejects %j', async (query, field) => {
    expect(await parse(query)).toEqual([field]);
  });
});
