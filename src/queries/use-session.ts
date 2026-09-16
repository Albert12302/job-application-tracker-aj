import { useSyncExternalStore } from 'react';
import { sessionStore, type SessionState, type SessionUser } from '@/data/auth';

export type { SessionState, SessionUser };

/**
 * The session is not fetched: supabase-js owns it and announces changes, so
 * this subscribes rather than queries.
 */
export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
}

/**
 * The signed-in user, for screens behind the authenticated route. Still
 * answers for a moment after sign-out, while the redirect to /sign-in lands.
 */
export function useSignedInUser(): SessionUser {
  const user = useSyncExternalStore(sessionStore.subscribe, sessionStore.lastUser);
  if (!user) throw new Error('useSignedInUser rendered outside the authenticated routes');
  return user;
}

export function useIsSignedIn(): boolean {
  return useSession().status === 'signed-in';
}

/** Outside render — e.g. in a mutation callback, where a hook's value would be stale. */
export function isSignedInNow(): boolean {
  return sessionStore.get().status === 'signed-in';
}
