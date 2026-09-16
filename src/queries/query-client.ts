import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    // One retry absorbs a blip; more would keep a real failure on a skeleton for seconds.
    queries: { retry: 1 },
    // A retried upload is a second upload. Retrying is the user's call (§8.2 "Retry").
    mutations: { retry: false },
  },
});
