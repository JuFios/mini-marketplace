import { Injectable } from '@nestjs/common';
import {
  ResourceConflictException,
  UnauthorizedAppException,
} from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { isUniqueViolation } from '../../common/filters/database-error';
import type { Prisma, User } from '../../generated/prisma/client';
import { CreateUserData, UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  findById(id: string, tx?: Prisma.TransactionClient): Promise<User | null> {
    return this.users.findById(id, tx);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findByEmail(email);
  }

  /** The caller's own profile; a valid token for a deleted account is no longer a valid login. */
  async getProfile(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new UnauthorizedAppException();
    return user;
  }

  async create(data: CreateUserData): Promise<User> {
    try {
      return await this.users.create(data);
    } catch (error) {
      // The unique index is the arbiter: two simultaneous registrations pass any pre-check.
      if (isUniqueViolation(error)) {
        throw new ResourceConflictException(
          'This email is already registered',
          ErrorCode.EMAIL_ALREADY_REGISTERED,
        );
      }
      throw error;
    }
  }
}
