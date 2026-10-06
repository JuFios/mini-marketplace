import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UnauthorizedAppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedRequest, AuthenticatedUser } from '../auth.types';

/** The authenticated caller; only usable on routes that are not `@Public()`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) throw new UnauthorizedAppException();
    return user;
  },
);
