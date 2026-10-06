import { createContext } from 'react';
import type { User } from '@/shared/api/types';
import type { LoginValues, RegisterValues } from './schemas';

export interface AuthContextValue {
  /** `null` when nobody is logged in. */
  user: User | null;
  login: (values: LoginValues) => Promise<void>;
  register: (values: RegisterValues) => Promise<void>;
  /** Always ends the session locally; rejects if the server could not be told. */
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
