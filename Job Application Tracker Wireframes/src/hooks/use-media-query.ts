import { useCallback, useSyncExternalStore } from 'react';

/** Below the mobile breakpoint (SPEC §11) — the same test as Tailwind's `max-[760px]:`. */
export const NARROW = '(width < 760px)';

/** Whether `query` matches, kept current. False where matchMedia does not exist (jsdom). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
}
