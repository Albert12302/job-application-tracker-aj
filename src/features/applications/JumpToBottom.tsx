import { ArrowDownIcon } from 'lucide-react';
import { useSyncExternalStore, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { scrollBehavior } from '@/hooks/prefers-reduced-motion';

/** "More than ~100px of scroll remains" (SPEC §4.2). */
const THRESHOLD = 100;

function subscribe(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true });
  window.addEventListener('resize', onChange);
  // Rows arriving, a page change, or the builder opening change the height without a scroll.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onChange) : null;
  observer?.observe(document.body);
  return () => {
    window.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
    observer?.disconnect();
  };
}

const farFromBottom = () =>
  document.documentElement.scrollHeight - window.scrollY - window.innerHeight > THRESHOLD;

/**
 * The floating pill that jumps past a long page of rows to the pagination
 * (SPEC §4.2). A real button, after the list in the tab order.
 *
 * It moves focus as well as the view, to `target`: the pill hides once the
 * bottom is near, and focus left on a button that has gone falls back to the
 * top of the document. Under reduced motion the jump is instant (§10.4).
 */
export function JumpToBottom({ target }: { target: RefObject<HTMLElement | null> }) {
  const show = useSyncExternalStore(subscribe, farFromBottom, () => false);
  if (!show) return null;

  const jump = () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: scrollBehavior() });
    target.current?.focus({ preventScroll: true });
  };

  return (
    <Button
      variant="outline"
      onClick={jump}
      className="fixed bottom-[18px] left-1/2 z-20 h-[38px] -translate-x-1/2 rounded-full bg-card px-4 text-[13px] text-link shadow-[0_4px_14px_oklch(0%_0_0/0.14)] max-[760px]:h-11"
    >
      Jump to bottom
      <ArrowDownIcon aria-hidden="true" data-icon="inline-end" />
    </Button>
  );
}
