import { useSyncExternalStore } from 'react';
import { isOffline, subscribeToOnline } from '@/lib/online';

/** Whether the browser has a network, kept current (SPEC §8.2 "Offline"). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeToOnline, () => !isOffline());
}
