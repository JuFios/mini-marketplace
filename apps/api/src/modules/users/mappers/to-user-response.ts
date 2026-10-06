import type { User } from '../../../generated/prisma/client';
import type { UserResponse } from '../dto/user.response.dto';

/** Explicit allow-list: the entity also carries `passwordHash`, which must never be returned. */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
