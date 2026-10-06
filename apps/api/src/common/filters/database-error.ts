import { Prisma } from '../../generated/prisma/client';

/** PostgreSQL SQLSTATE codes the API reacts to. */
export const SqlState = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
} as const;

export interface DatabaseErrorInfo {
  /** Prisma's own code (`P2002`, `P2010`, ...). */
  prismaCode: string;
  /** SQLSTATE reported by PostgreSQL, when the error came from the database. */
  sqlState?: string;
  /** Name of the violated CHECK constraint, when `sqlState` is a check violation. */
  checkConstraint?: string;
}

const CHECK_CONSTRAINT_PATTERN = /violates check constraint "([^"]+)"/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the database failure out of a Prisma error.
 *
 * Prisma reports the same PostgreSQL failure under different `P20xx` codes depending on the API
 * used (a CHECK violation is `P2039` from the query builder but `P2010` from raw SQL), so the
 * SQLSTATE in the driver-adapter payload is the reliable discriminator.
 */
export function readDatabaseError(error: unknown): DatabaseErrorInfo | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;

  const info: DatabaseErrorInfo = { prismaCode: error.code };
  const adapterError: unknown = error.meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  if (!isRecord(cause)) return info;

  if (typeof cause.originalCode === 'string') info.sqlState = cause.originalCode;
  if (info.sqlState === SqlState.CHECK_VIOLATION && typeof cause.originalMessage === 'string') {
    info.checkConstraint = CHECK_CONSTRAINT_PATTERN.exec(cause.originalMessage)?.[1];
  }
  return info;
}

export function isUniqueViolation(error: unknown): boolean {
  const info = readDatabaseError(error);
  return info?.prismaCode === 'P2002' || info?.sqlState === SqlState.UNIQUE_VIOLATION;
}
