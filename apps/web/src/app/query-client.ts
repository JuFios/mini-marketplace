import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/errors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 4xx is an answer (not found, forbidden, invalid): asking again cannot change it.
        // Network failures and 5xx may be transient, so those are retried.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
        staleTime: 30_000,
      },
    },
  });
}
