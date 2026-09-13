/** The stats panel (§4.5): a fixed max-width that drops below 760px, with tighter padding (§11). */
export const STATS_PANEL =
  'mx-auto flex w-full max-w-[620px] flex-col gap-5 rounded-xl border bg-card p-6 shadow-xs max-[760px]:max-w-none max-[760px]:p-4';

/** Four stat cards to a row, two below 760px (§11). Shared with the skeleton so it cannot drift. */
export const STAT_GRID = 'grid grid-cols-4 gap-3 max-[760px]:grid-cols-2';

export const SECTION_HEADING = 'text-[13px] font-semibold text-muted-foreground';
