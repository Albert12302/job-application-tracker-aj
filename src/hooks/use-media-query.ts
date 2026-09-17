import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** Below the mobile breakpoint (SPEC §11) — the same test as Tailwind's `max-[760px]:`. */
export const NARROW = '(width < 760px)';

/** Whether `query` matches, kept current. False where matchMedia does not exist (jsdom). */
export function useMediaQuery(query: string): boolean {
  const list = useMemo(() => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null), [query]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!list) return () => {};
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [list],
  );
  return useSyncExternalStore(subscribe, () => list?.matches ?? false);
}
