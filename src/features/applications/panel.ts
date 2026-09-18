const CARD = 'mx-auto flex w-full flex-col gap-4 rounded-xl border bg-card p-6 shadow-xs max-[760px]:p-4';

/**
 * Every application screen's width — the detail screen and the add and edit forms — so
 * moving between them never changes the card. Wide enough that a description and notes
 * read at a comfortable line length (§4.4); the form fills it in two columns.
 */
export const DETAIL_WIDTH = 'max-w-[860px]';

/** The centred card the add and edit forms sit in (§4.3, §11): the detail screen's width. */
export const PANEL = `${CARD} ${DETAIL_WIDTH}`;

/** The detail screen's card, in every state, so loading never changes its width. */
export const DETAIL_PANEL = `${CARD} ${DETAIL_WIDTH}`;

/** The heading above each block of the detail screen. */
export const SECTION_HEADING = 'text-lg font-semibold text-muted-foreground';
