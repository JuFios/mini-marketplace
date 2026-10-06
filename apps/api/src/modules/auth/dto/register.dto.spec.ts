import { createValidationPipe } from '../../../common/pipes/validation.pipe';
import type { ValidationErrorDetail } from '../../../common/exceptions/app.exception';
import { RegisterDto } from './register.dto';

async function validate(
  body: Record<string, unknown>,
): Promise<ValidationErrorDetail[] | RegisterDto> {
  try {
    return (await createValidationPipe().transform(body, {
      type: 'body',
      metatype: RegisterDto,
    })) as RegisterDto;
  } catch (error) {
    return (error as { details: ValidationErrorDetail[] }).details;
  }
}

const VALID = { email: 'ann@example.com', password: 'secret123', name: 'Ann' };

describe('RegisterDto password policy', () => {
  it('accepts 8-72 characters with a letter and a digit', async () => {
    expect(await validate(VALID)).toBeInstanceOf(RegisterDto);
    expect(await validate({ ...VALID, password: 'a1'.repeat(36) })).toBeInstanceOf(RegisterDto);
  });

  it.each([
    ['shorter than 8 characters', 'abc123'],
    ['longer than 72 characters', 'a1'.repeat(37)],
    ['without a digit', 'onlyletters'],
    ['without a letter', '12345678'],
  ])('rejects a password %s', async (_label, password) => {
    const result = await validate({ ...VALID, password });

    expect(result).toEqual([expect.objectContaining({ field: 'password' })]);
  });

  it('does not trim the password', async () => {
    const result = (await validate({ ...VALID, password: ' secret123 ' })) as RegisterDto;

    expect(result.password).toBe(' secret123 ');
  });
});

describe('RegisterDto normalisation', () => {
  it('trims and lower-cases the email, trims the name', async () => {
    const result = (await validate({
      ...VALID,
      email: '  Ann@Example.COM ',
      name: '  Ann  ',
    })) as RegisterDto;

    expect(result).toMatchObject({ email: 'ann@example.com', name: 'Ann' });
  });

  it.each([
    ['an invalid email', { email: 'nope' }, 'email'],
    ['an empty name', { name: '   ' }, 'name'],
    ['a name over 100 characters', { name: 'x'.repeat(101) }, 'name'],
    ['an attempt to set the role', { role: 'ADMIN' }, 'role'],
  ])('rejects %s', async (_label, override, field) => {
    expect(await validate({ ...VALID, ...override })).toEqual([expect.objectContaining({ field })]);
  });
});
