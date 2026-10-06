import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenAppException } from '../../../common/exceptions/app.exception';
import type { Role } from '../../../generated/prisma/client';
import type { AuthenticatedRequest } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Global guard, runs after JwtAuthGuard: enforces `@Roles()` where it is present. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !required.includes(user.role)) throw new ForbiddenAppException();
    return true;
  }
}
