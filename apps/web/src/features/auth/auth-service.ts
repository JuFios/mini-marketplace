import type { ApiClient } from '@/shared/api/http-client';
import type { AuthResponse } from '@/shared/api/types';
import type { LoginValues, RegisterValues } from './schemas';

/** The login, registration and logout calls, each followed by the matching change of the session. */
export function createAuthService({ http, session }: ApiClient) {
  // Plain functions, not methods: the provider hands them out as callbacks.
  const login = async (values: LoginValues): Promise<void> => {
    const { data } = await http.post<AuthResponse>('/auth/login', values);
    session.start(data);
  };

  const register = async (values: RegisterValues): Promise<void> => {
    const { data } = await http.post<AuthResponse>('/auth/register', values);
    session.start(data);
  };

  const logout = async (): Promise<void> => {
    try {
      await http.post('/auth/logout');
    } finally {
      // The person asked to leave: they are logged out here even if the server could not be told
      // (it then still holds the refresh token until it expires).
      session.end();
    }
  };

  return { login, register, logout };
}
