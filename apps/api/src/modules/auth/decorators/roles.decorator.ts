import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/** Restricts a route (or a whole controller) to the given roles. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
