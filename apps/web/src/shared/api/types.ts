// Hand-written mirror of the API contract (Swagger is the source of truth); only what the
// frontend uses is declared here.

export type Role = 'CUSTOMER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  /** Lifetime of the access token in seconds. */
  expiresIn: number;
}
