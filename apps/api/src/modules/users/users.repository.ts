import { Injectable } from '@nestjs/common';
import { Prisma, Role, User } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
  role?: Role;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, tx?: Prisma.TransactionClient): Promise<User | null> {
    return (tx ?? this.prisma).user.findUnique({ where: { id } });
  }

  findByEmail(email: string, tx?: Prisma.TransactionClient): Promise<User | null> {
    return (tx ?? this.prisma).user.findUnique({ where: { email } });
  }

  create(data: CreateUserData, tx?: Prisma.TransactionClient): Promise<User> {
    return (tx ?? this.prisma).user.create({ data });
  }
}
