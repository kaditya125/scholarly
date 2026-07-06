import { QueryClient } from '@tanstack/react-query';

/**
 * Global React Query client. Retries transient failures, keeps data fresh for
 * 30s, and avoids noisy refetches on window focus for a dashboard context.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
