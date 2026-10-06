import { createApiClient } from './http-client';

/** The application's one API client; the `/api` prefix is proxied to the backend in every environment. */
export const apiClient = createApiClient({ baseURL: '/api/v1' });

export const { http, session } = apiClient;
