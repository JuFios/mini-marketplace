import { UserResponse } from '../../users/dto/user.response.dto';

export class AuthResponse {
  user!: UserResponse;
  accessToken!: string;
  /** Lifetime of the access token in seconds. */
  expiresIn!: number;
}
