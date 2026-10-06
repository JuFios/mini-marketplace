import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service';
import {
  RefreshTokenInvalidException,
  UnauthorizedAppException,
} from '../../common/exceptions/app.exception';
import { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from './auth.types';

const ALGORITHM = 'HS256';

export interface RefreshClaims {
  /** User id. */
  sub: string;
  /** Id of the `refresh_tokens` row. */
  jti: string;
  /** Rotation family (one per login session). */
  fam: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ROLES: readonly string[] = Object.values(Role);

/**
 * Signs and verifies both token kinds. They use different secrets, so a token of one kind can
 * never be accepted as the other.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccess(user: AuthenticatedUser): string {
    return this.jwt.sign(
      { role: user.role },
      {
        secret: this.config.jwtAccessSecret,
        algorithm: ALGORITHM,
        subject: user.id,
        expiresIn: this.config.jwtAccessTtlSeconds,
      },
    );
  }

  verifyAccess(token: string): AuthenticatedUser {
    let payload: unknown;
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.jwtAccessSecret,
        algorithms: [ALGORITHM],
      });
    } catch {
      throw new UnauthorizedAppException('Invalid or expired access token');
    }
    if (
      !isRecord(payload) ||
      typeof payload.sub !== 'string' ||
      typeof payload.role !== 'string' ||
      !ROLES.includes(payload.role)
    ) {
      throw new UnauthorizedAppException('Invalid or expired access token');
    }
    return { id: payload.sub, role: payload.role as Role };
  }

  signRefresh(claims: RefreshClaims): string {
    return this.jwt.sign(
      { fam: claims.fam },
      {
        secret: this.config.jwtRefreshSecret,
        algorithm: ALGORITHM,
        subject: claims.sub,
        jwtid: claims.jti,
        expiresIn: this.config.jwtRefreshTtlSeconds,
      },
    );
  }

  /** `ignoreExpiration` lets logout revoke the session behind an already expired cookie. */
  verifyRefresh(token: string, options: { ignoreExpiration?: boolean } = {}): RefreshClaims {
    let payload: unknown;
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.jwtRefreshSecret,
        algorithms: [ALGORITHM],
        ignoreExpiration: options.ignoreExpiration,
      });
    } catch {
      throw new RefreshTokenInvalidException();
    }
    if (
      !isRecord(payload) ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string' ||
      typeof payload.fam !== 'string'
    ) {
      throw new RefreshTokenInvalidException();
    }
    return { sub: payload.sub, jti: payload.jti, fam: payload.fam };
  }
}
