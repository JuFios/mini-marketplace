import { Role } from '../../../generated/prisma/client';

export class UserResponse {
  id!: string;
  email!: string;
  name!: string;
  role!: Role;
  createdAt!: string;
}
