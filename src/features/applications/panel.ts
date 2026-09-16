const CARD = 'mx-auto flex w-full flex-col gap-4 rounded-xl border bg-card p-6 shadow-xs max-[760px]:p-4';

/** The centred card the add and edit forms sit in (§4.3, §11). */
export const PANEL = `${CARD} max-w-[460px]`;

/** The detail screen's width: wider than the forms, so a description and notes read at a comfortable line length (§4.4). */
export const DETAIL_WIDTH = 'max-w-[860px]';

/** The detail screen's card, in every state, so loading never changes its width. */
export const DETAIL_PANEL = `${CARD} ${DETAIL_WIDTH}`;

/** The heading above each block of the detail screen. */
export const SECTION_HEADING = 'text-lg font-semibold text-muted-foreground';
