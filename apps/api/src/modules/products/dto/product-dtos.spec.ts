import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createValidationPipe } from '../../../common/pipes/validation.pipe';
import { CreateCategoryDto } from '../../categories/dto/category.dto';
import { AdminProductQueryDto } from './admin-product-query.dto';
import { CreateProductDto } from './create-product.dto';
import { StockAdjustmentDto } from './stock-adjustment.dto';
import { UpdateProductDto } from './update-product.dto';

type Ctor = new () => object;

/** Field names that failed validation (empty when the input is valid). */
async function failures(metatype: Ctor, body: Record<string, unknown>): Promise<string[]> {
  try {
    await createValidationPipe().transform(body, { type: 'body', metatype });
    return [];
  } catch (error) {
    return (error as { details: { field: string }[] }).details.map((d) => d.field);
  }
}

const CATEGORY_ID = '3f2b1c1e-7c1a-4b0e-9a54-0d1c5f0a7b11';
const VALID = {
  name: 'Mouse',
  description: 'Nice',
  price: '24.99',
  categoryId: CATEGORY_ID,
  stock: 5,
};

describe('CreateProductDto', () => {
  it('accepts a valid product, with or without an image', async () => {
    expect(await failures(CreateProductDto, VALID)).toEqual([]);
    expect(
      await failures(CreateProductDto, { ...VALID, imageUrl: 'https://cdn.example.com/a.png' }),
    ).toEqual([]);
    expect(
      await failures(CreateProductDto, {
        ...VALID,
        imageUrl: '/uploads/3f2b1c1e-7c1a-4b0e-9a54-0d1c5f0a7b11.webp',
      }),
    ).toEqual([]);
  });

  it.each([
    ['0.00', 'zero'],
    ['-5.00', 'negative'],
    ['abc', 'not a number'],
    ['10.999', 'three fraction digits'],
    ['1000000.01', 'above the maximum'],
    ['12345678.00', 'too many digits'],
    ['', 'empty'],
  ])('rejects the price "%s" (%s)', async (price) => {
    expect(await failures(CreateProductDto, { ...VALID, price })).toEqual(['price']);
  });

  it('accepts the boundary prices', async () => {
    expect(await failures(CreateProductDto, { ...VALID, price: '0.01' })).toEqual([]);
    expect(await failures(CreateProductDto, { ...VALID, price: '1000000.00' })).toEqual([]);
    expect(await failures(CreateProductDto, { ...VALID, price: '5' })).toEqual([]);
  });

  it('rejects a price sent as a number: money is a string', async () => {
    expect(await failures(CreateProductDto, { ...VALID, price: 24.99 })).toEqual(['price']);
  });

  it.each([
    ['negative stock', { stock: -1 }, 'stock'],
    ['fractional stock', { stock: 1.5 }, 'stock'],
    ['stock sent as a string', { stock: '5' }, 'stock'],
    ['stock above the maximum', { stock: 1_000_001 }, 'stock'],
    ['an empty name', { name: '   ' }, 'name'],
    ['a name over 200 characters', { name: 'x'.repeat(201) }, 'name'],
    ['a description over 5000 characters', { description: 'x'.repeat(5001) }, 'description'],
    ['a category id that is not a UUID', { categoryId: '42' }, 'categoryId'],
    ['an image URL with a javascript: scheme', { imageUrl: 'javascript:alert(1)' }, 'imageUrl'],
    // The web app's CSP loads images over https only.
    ['an image URL over plain http', { imageUrl: 'http://cdn.example.com/a.png' }, 'imageUrl'],
    ['an image path outside /uploads', { imageUrl: '/etc/passwd' }, 'imageUrl'],
    ['an /uploads path with traversal', { imageUrl: '/uploads/../secret.png' }, 'imageUrl'],
    [
      'an image URL over 2048 characters',
      { imageUrl: `https://e.com/${'a'.repeat(2048)}` },
      'imageUrl',
    ],
  ])('rejects %s', async (_label, override, field) => {
    expect(await failures(CreateProductDto, { ...VALID, ...override })).toEqual([field]);
  });
});

describe('UpdateProductDto', () => {
  it('accepts any subset of fields, including none', async () => {
    expect(await failures(UpdateProductDto, {})).toEqual([]);
    expect(await failures(UpdateProductDto, { price: '9.99' })).toEqual([]);
  });

  it('cannot change stock: it is rejected as an unknown property', async () => {
    expect(await failures(UpdateProductDto, { stock: 100 })).toEqual(['stock']);
  });

  it('allows clearing the image with null, but no other field', async () => {
    expect(await failures(UpdateProductDto, { imageUrl: null })).toEqual([]);
    expect(await failures(UpdateProductDto, { name: null })).toEqual(['name']);
    expect(await failures(UpdateProductDto, { price: null })).toEqual(['price']);
    expect(await failures(UpdateProductDto, { categoryId: null })).toEqual(['categoryId']);
  });
});

describe('StockAdjustmentDto', () => {
  it.each([5, -5, 1, -1, 1_000_000])('accepts a delta of %i', async (delta) => {
    expect(await failures(StockAdjustmentDto, { delta })).toEqual([]);
  });

  it.each([[0], [1.5], ['3'], [1_000_001], [null]])('rejects a delta of %p', async (delta) => {
    expect(await failures(StockAdjustmentDto, { delta })).toEqual(['delta']);
  });

  it('accepts an optional reason up to 200 characters', async () => {
    expect(await failures(StockAdjustmentDto, { delta: 1, reason: 'recount' })).toEqual([]);
    expect(await failures(StockAdjustmentDto, { delta: 1, reason: 'x'.repeat(201) })).toEqual([
      'reason',
    ]);
  });
});

describe('AdminProductQueryDto', () => {
  const parse = (query: Record<string, unknown>) => plainToInstance(AdminProductQueryDto, query);

  it('applies defaults', async () => {
    const dto = parse({});

    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 20, status: 'all' });
  });

  it('converts numeric query strings', () => {
    expect(parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });

  it.each([
    [{ limit: '101' }, 'limit'],
    [{ limit: '0' }, 'limit'],
    [{ page: '0' }, 'page'],
    [{ page: 'abc' }, 'page'],
    [{ status: 'deleted' }, 'status'],
    [{ categoryId: 'nope' }, 'categoryId'],
    [{ search: 'x'.repeat(101) }, 'search'],
  ])('rejects %j', async (query, field) => {
    expect(await failures(AdminProductQueryDto, query)).toEqual([field]);
  });
});

describe('CreateCategoryDto', () => {
  it('trims the name and enforces 1-100 characters', async () => {
    expect(await failures(CreateCategoryDto, { name: ' Books ' })).toEqual([]);
    expect(await failures(CreateCategoryDto, { name: '  ' })).toEqual(['name']);
    expect(await failures(CreateCategoryDto, { name: 'x'.repeat(101) })).toEqual(['name']);
  });
});
