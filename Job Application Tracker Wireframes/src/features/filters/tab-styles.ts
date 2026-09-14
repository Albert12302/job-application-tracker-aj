import { cn } from '@/lib/utils';

/**
 * One tab's look, shared by the status tabs, saved filters, and + Filter. 30px
 * tall in a 3px well, 44px below 760px (§11). The active tab is a white pill
 * edged in the form-control border, so its state shows by more than a fill
 * (§10.1); aria-pressed carries it to assistive technology.
 */
export const TAB_WELL = 'inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-secondary p-[3px]';

export const tabButton = (active: boolean) =>
  cn(
    'inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap outline-none',
    'focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 max-[760px]:h-11',
    active ? 'bg-card text-foreground shadow-sm ring-1 ring-input' : 'text-secondary-foreground hover:bg-card/60',
  );
