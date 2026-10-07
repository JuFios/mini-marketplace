import { Injectable } from '@nestjs/common';
import type { Prisma, RefreshToken } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CreateRefreshTokenData {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateRefreshTokenData, tx?: Prisma.TransactionClient): Promise<RefreshToken> {
    return (tx ?? this.prisma).refreshToken.create({ data });
  }

  findById(id: string, tx?: Prisma.TransactionClient): Promise<RefreshToken | null> {
    return (tx ?? this.prisma).refreshToken.findUnique({ where: { id } });
  }

  /**
   * Atomically consumes a token: of any number of concurrent callers presenting the same id,
   * exactly one gets `true`. The conditional UPDATE is what makes rotation race-free.
   */
  async revokeIfActive(id: string, now: Date, tx?: Prisma.TransactionClient): Promise<boolean> {
    const { count } = await (tx ?? this.prisma).refreshToken.updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  /** Revokes every still-active token of a login session. */
  async revokeFamily(familyId: string, now: Date, tx?: Prisma.TransactionClient): Promise<number> {
    const { count } = await (tx ?? this.prisma).refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  /**
   * Deletes up to `limit` tokens that expired before `before` and returns how many it deleted.
   * The limit keeps each statement short however large the backlog is.
   */
  deleteExpiredBefore(before: Date, limit: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM refresh_tokens
      WHERE id IN (
        SELECT id FROM refresh_tokens WHERE expires_at < ${before}::timestamptz LIMIT ${limit}::int
      )`;
  }
}
