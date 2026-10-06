import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client';

/** Identity of the caller, taken from the verified access token and nowhere else. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
