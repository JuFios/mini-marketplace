import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedAppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../token.service';

const BEARER_PREFIX = 'Bearer ';

/** Global guard: every route needs a valid access token unless it is marked `@Public()`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) throw new UnauthorizedAppException();

    // Identity and role come from the verified token only, never from the request body.
    request.user = this.tokens.verifyAccess(header.slice(BEARER_PREFIX.length));
    return true;
  }
}
