import { cn } from '@/lib/utils';

/**
 * One tab's look, shared by the status tabs, saved filters, and + Filter. 30px
 * tall in a 3px well, 44px below 760px (§11). The active tab is a white pill
 * edged in the tabs' own text colour — 7.4:1 against the well, where the
 * form-control border measured 2.7:1 — so its state shows by more than a fill
 * (§10.1); aria-pressed carries it to assistive technology.
 */
export const ACTIVE_TAB = 'bg-card shadow-sm ring-1 ring-secondary-foreground';

export const TAB_WELL = 'inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-secondary p-[3px]';

export const tabButton = (active: boolean) =>
  cn(
    'inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap outline-none',
    'focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 max-[760px]:h-11',
    active ? cn(ACTIVE_TAB, 'text-foreground') : 'text-secondary-foreground hover:bg-card/60',
  );
