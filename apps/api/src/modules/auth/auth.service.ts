import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import {
  InvalidCredentialsException,
  RefreshTokenInvalidException,
} from '../../common/exceptions/app.exception';
import { AppConfigService } from '../../config/app-config.service';
import { Prisma, Role, User } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RefreshClaims, TokenService } from './token.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';

/** What a successful register/login/refresh produces; the controller splits it into body and cookie. */
export interface AuthSession {
  user: User;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    // Injected without `@InjectPinoLogger`: that token is only registered for classes imported
    // before the logger module is, which would make module import order significant.
    this.logger.setContext(AuthService.name);
  }

  async register(dto: RegisterDto): Promise<AuthSession> {
    // Registration always creates a customer; administrators come from the seed.
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      passwordHash: await this.passwords.hash(dto.password),
      role: Role.CUSTOMER,
    });
    this.logger.info({ event: 'user.registered', userId: user.id }, 'User registered');
    return this.issueSession(user, randomUUID());
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      await this.passwords.verifyAgainstNothing(dto.password);
      this.logger.warn({ event: 'auth.login_failed', reason: 'unknown_email' }, 'Login failed');
      throw new InvalidCredentialsException();
    }
    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      this.logger.warn(
        { event: 'auth.login_failed', reason: 'wrong_password', userId: user.id },
        'Login failed',
      );
      throw new InvalidCredentialsException();
    }
    return this.issueSession(user, randomUUID());
  }

  /**
   * Rotates the refresh token: the presented one is consumed and a new one issued in the same
   * transaction. Presenting an already consumed token means it was copied (or replayed), so the
   * whole login session is revoked.
   */
  async refresh(presented: string | undefined): Promise<AuthSession> {
    if (!presented) throw new RefreshTokenInvalidException();
    const claims = this.tokens.verifyRefresh(presented);
    const now = new Date();

    const rotated = await this.prisma.$transaction(async (tx) => {
      // Conditional UPDATE: of two concurrent requests with the same token only one wins.
      if (!(await this.refreshTokens.revokeIfActive(claims.jti, now, tx))) return null;
      const user = await this.users.findById(claims.sub, tx);
      if (!user) return null;
      return this.issueSession(user, claims.fam, tx);
    });
    if (rotated) return rotated;

    await this.revokeSessionIfReused(claims, now);
    throw new RefreshTokenInvalidException();
  }

  /** Idempotent and silent: logging out twice, or with a broken cookie, is not an error. */
  async logout(presented: string | undefined): Promise<void> {
    if (!presented) return;
    let claims: RefreshClaims;
    try {
      claims = this.tokens.verifyRefresh(presented, { ignoreExpiration: true });
    } catch {
      return;
    }
    await this.refreshTokens.revokeFamily(claims.fam, new Date());
  }

  private async revokeSessionIfReused(claims: RefreshClaims, now: Date): Promise<void> {
    const row = await this.refreshTokens.findById(claims.jti);
    // A row that exists but was not revocable now was revoked earlier: its token is being replayed.
    if (!row?.revokedAt) return;
    await this.refreshTokens.revokeFamily(row.familyId, now);
    this.logger.warn(
      { event: 'auth.refresh_reuse_detected', userId: row.userId, familyId: row.familyId },
      'Refresh token reuse detected, session revoked',
    );
  }

  private async issueSession(
    user: User,
    familyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthSession> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + this.config.jwtRefreshTtlSeconds * 1000);
    await this.refreshTokens.create({ id, userId: user.id, familyId, expiresAt }, tx);

    return {
      user,
      accessToken: this.tokens.signAccess({ id: user.id, role: user.role }),
      expiresIn: this.config.jwtAccessTtlSeconds,
      refreshToken: this.tokens.signRefresh({ sub: user.id, jti: id, fam: familyId }),
    };
  }
}
