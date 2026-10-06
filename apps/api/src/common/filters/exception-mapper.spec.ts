import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AppException, ResourceNotFoundException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';
import { toAppException } from './exception-mapper';

// Mirrors what Prisma + the pg driver adapter actually report: the top-level `P20xx` code
// varies with the API used, while the SQLSTATE sits in `meta.driverAdapterError.cause`.
function prismaError(code: string, cause?: Record<string, unknown>): Error {
  return new Prisma.PrismaClientKnownRequestError('failed', {
    code,
    clientVersion: 'test',
    meta: cause ? { driverAdapterError: { name: 'DriverAdapterError', cause } } : undefined,
  });
}

function checkViolation(constraint: string): Record<string, unknown> {
  return {
    originalCode: '23514',
    originalMessage: `new row for relation "t" violates check constraint "${constraint}"`,
  };
}

describe('toAppException', () => {
  describe('application exceptions', () => {
    it('passes an AppException through unchanged', () => {
      const original = new ResourceNotFoundException('No such product', ErrorCode.NOT_FOUND);

      expect(toAppException(original)).toBe(original);
    });
  });

  describe('Nest HTTP exceptions', () => {
    it.each([
      [new NotFoundException('Cannot GET /x'), 404, ErrorCode.NOT_FOUND],
      [new ForbiddenException(), 403, ErrorCode.FORBIDDEN],
      [
        new BadRequestException('Validation failed (uuid is expected)'),
        400,
        ErrorCode.VALIDATION_FAILED,
      ],
      [new HttpException('Too many requests', 429), 429, ErrorCode.TOO_MANY_REQUESTS],
      [new ServiceUnavailableException('db down'), 503, ErrorCode.SERVICE_UNAVAILABLE],
    ])('maps %s to its status and stable code', (exception, status, code) => {
      const mapped = toAppException(exception);

      expect(mapped.httpStatus).toBe(status);
      expect(mapped.code).toBe(code);
    });

    it('joins an array of messages into one', () => {
      const mapped = toAppException(
        new BadRequestException({ message: ['a is wrong', 'b is wrong'] }),
      );

      expect(mapped.message).toBe('a is wrong; b is wrong');
    });

    it('falls back to BAD_REQUEST for client errors without a dedicated code', () => {
      expect(toAppException(new HttpException('teapot', 418)).code).toBe(ErrorCode.BAD_REQUEST);
    });

    it('does not expose the message of a 5xx HTTP exception', () => {
      const mapped = toAppException(new InternalServerErrorException('connection string leaked'));

      expect(mapped.httpStatus).toBe(500);
      expect(mapped.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(mapped.message).not.toContain('leaked');
    });
  });

  describe('Prisma and PostgreSQL errors', () => {
    it('maps a unique violation from the query builder (P2002) to 409 CONFLICT', () => {
      const mapped = toAppException(prismaError('P2002', { originalCode: '23505' }));

      expect(mapped).toMatchObject({ httpStatus: 409, code: ErrorCode.CONFLICT });
    });

    it('maps a unique violation from raw SQL (P2010 + 23505) to 409 CONFLICT', () => {
      const mapped = toAppException(prismaError('P2010', { originalCode: '23505' }));

      expect(mapped).toMatchObject({ httpStatus: 409, code: ErrorCode.CONFLICT });
    });

    it('maps a foreign key violation (P2003) to 409 CONFLICT', () => {
      const mapped = toAppException(prismaError('P2003', { originalCode: '23503' }));

      expect(mapped).toMatchObject({ httpStatus: 409, code: ErrorCode.CONFLICT });
    });

    it('maps a missing record (P2025) to 404 NOT_FOUND', () => {
      const mapped = toAppException(prismaError('P2025'));

      expect(mapped).toMatchObject({ httpStatus: 404, code: ErrorCode.NOT_FOUND });
    });

    it.each([
      ['a deadlock reported by raw SQL (40P01)', prismaError('P2010', { originalCode: '40P01' })],
      ['a serialization failure (40001)', prismaError('P2010', { originalCode: '40001' })],
      ['a write conflict reported by the query builder (P2034)', prismaError('P2034')],
    ])('maps %s to a retryable 409 CONCURRENT_UPDATE', (_label, error) => {
      expect(toAppException(error)).toMatchObject({
        httpStatus: 409,
        code: ErrorCode.CONCURRENT_UPDATE,
      });
    });

    it('maps a negative-stock CHECK violation to INSUFFICIENT_STOCK, from either API', () => {
      const cause = checkViolation('products_stock_non_negative');

      expect(toAppException(prismaError('P2039', cause)).code).toBe(ErrorCode.INSUFFICIENT_STOCK);
      expect(toAppException(prismaError('P2010', cause)).code).toBe(ErrorCode.INSUFFICIENT_STOCK);
    });

    it('maps a cart quantity CHECK violation to CART_LIMIT_EXCEEDED', () => {
      const mapped = toAppException(
        prismaError('P2010', checkViolation('cart_items_quantity_range')),
      );

      expect(mapped).toMatchObject({ httpStatus: 409, code: ErrorCode.CART_LIMIT_EXCEEDED });
    });

    it('treats any other CHECK violation as a bug: 500', () => {
      const mapped = toAppException(
        prismaError('P2010', checkViolation('products_price_positive')),
      );

      expect(mapped).toMatchObject({ httpStatus: 500, code: ErrorCode.INTERNAL_ERROR });
    });

    it('treats an unrecognised Prisma error as a 500', () => {
      expect(toAppException(prismaError('P1001')).httpStatus).toBe(500);
    });
  });

  describe('request body parser errors', () => {
    it('maps an oversized payload to 413 PAYLOAD_TOO_LARGE with a fixed message', () => {
      const mapped = toAppException({
        status: 413,
        expose: true,
        type: 'entity.too.large',
        message: 'request entity too large',
      });

      expect(mapped).toMatchObject({
        httpStatus: 413,
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: 'Request body is too large',
      });
    });

    it('does not trust a server-side error just because it carries a status', () => {
      expect(toAppException({ status: 500, expose: false, message: 'secret' }).code).toBe(
        ErrorCode.INTERNAL_ERROR,
      );
    });
  });

  describe('unexpected errors', () => {
    it('turns an arbitrary Error into a generic 500 without leaking its message', () => {
      const mapped = toAppException(new Error('password authentication failed for user "app"'));

      expect(mapped.httpStatus).toBe(500);
      expect(mapped.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(mapped.message).toBe('Internal server error');
    });

    it.each([
      ['a thrown string', 'oops'],
      ['undefined', undefined],
      ['null', null],
    ])('handles %s', (_label, thrown) => {
      expect(toAppException(thrown)).toBeInstanceOf(AppException);
      expect(toAppException(thrown).httpStatus).toBe(500);
    });
  });
});
