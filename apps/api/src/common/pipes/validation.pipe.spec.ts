import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';
import { ValidationErrorDetail, ValidationFailedException } from '../exceptions/app.exception';
import { createValidationPipe } from './validation.pipe';

class LineDto {
  @IsInt()
  @Min(1)
  quantity!: number;
}

class OrderDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

async function validationDetails(payload: unknown): Promise<ValidationErrorDetail[]> {
  try {
    await createValidationPipe().transform(payload, { type: 'body', metatype: OrderDto });
  } catch (error) {
    if (error instanceof ValidationFailedException) return error.details as ValidationErrorDetail[];
    throw error;
  }
  throw new Error('Expected validation to fail');
}

describe('validation pipe', () => {
  it('accepts a valid payload and transforms it into the DTO class', async () => {
    const result: unknown = await createValidationPipe().transform(
      { name: 'order', lines: [{ quantity: 2 }] },
      { type: 'body', metatype: OrderDto },
    );

    expect(result).toBeInstanceOf(OrderDto);
  });

  it('reports one entry per invalid field, with dotted paths for nested ones', async () => {
    const details = await validationDetails({ name: '', lines: [{ quantity: 0 }] });

    expect(details).toEqual(
      expect.arrayContaining([
        { field: 'name', messages: ['name should not be empty'] },
        { field: 'lines.0.quantity', messages: ['quantity must not be less than 1'] },
      ]),
    );
  });

  it('rejects properties that are not part of the DTO instead of dropping them', async () => {
    const details = await validationDetails({ name: 'order', lines: [], isAdmin: true });

    expect(details).toEqual([
      { field: 'isAdmin', messages: ['property isAdmin should not exist'] },
    ]);
  });

  it('raises a 400 VALIDATION_FAILED exception', async () => {
    await expect(
      createValidationPipe().transform({}, { type: 'body', metatype: OrderDto }),
    ).rejects.toMatchObject({ httpStatus: 400, code: 'VALIDATION_FAILED' });
  });
});
