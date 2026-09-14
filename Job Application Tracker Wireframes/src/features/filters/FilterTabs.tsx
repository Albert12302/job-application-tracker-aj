import { PlusIcon } from 'lucide-react';
import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import { ALL_FILTER, type TabCounts } from '@/domain/filters';
import type { SavedFilter } from '@/domain/schemas';
import { STATUSES } from '@/domain/status';
import { SavedFilterTab } from './SavedFilterTab';
import { TAB_WELL, tabButton } from './tab-styles';

export type SavedFiltersState =
  | { status: 'pending' }
  | { status: 'error'; retrying: boolean; onRetry: () => void }
  | { status: 'success'; filters: SavedFilter[] };

/**
 * The filter tabs (SPEC §4.2): All, one per status, then saved filters, then
 * + Filter. Counts cover the whole application set, never the search (§5.3),
 * and are left off while the list is loading.
 *
 * Toggle buttons in a labelled group rather than ARIA tabs: they narrow one
 * list rather than switch panels, and a saved filter's tab carries its own ×.
 *
 * Saved filters that fail to load do not block anything (§8.2): the status tabs
 * stay, with the failure and Retry beside + Filter, which waits until the
 * filters are known — the next "Custom N" depends on them.
 */
export function FilterTabs({
  active,
  counts,
  saved,
  disabled,
  builder,
  allRef,
  builderRef,
  onSelect,
  onDelete,
}: {
  /** The active tab's URL value. */
  active: string;
  counts: TabCounts | null;
  saved: SavedFiltersState;
  /** While the list itself is loading or failed (§8.2: controls visible but disabled). */
  disabled: boolean;
  builder: { open: boolean; controls: string; onToggle: () => void };
  allRef?: Ref<HTMLButtonElement>;
  builderRef?: Ref<HTMLButtonElement>;
  onSelect: (filter: string) => void;
  onDelete: (filter: SavedFilter) => void;
}) {
  const label = (name: string, count: number | undefined) => (count === undefined ? name : `${name} (${count})`);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="group" aria-label="Filter applications" className={TAB_WELL}>
        <button
          ref={allRef}
          type="button"
          aria-pressed={active === ALL_FILTER}
          disabled={disabled}
          onClick={() => onSelect(ALL_FILTER)}
          className={tabButton(active === ALL_FILTER)}
        >
          {label('All', counts?.all)}
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={active === status}
            disabled={disabled}
            onClick={() => onSelect(status)}
            className={tabButton(active === status)}
          >
            {label(status, counts?.byStatus[status])}
          </button>
        ))}
        {saved.status === 'success'
          ? saved.filters.map((filter) => (
              <SavedFilterTab
                key={filter.id}
                filter={filter}
                count={counts ? (counts.bySavedFilter[filter.id] ?? 0) : null}
                active={active === filter.id}
                disabled={disabled}
                onSelect={() => onSelect(filter.id)}
                onDelete={() => onDelete(filter)}
              />
            ))
          : null}
        <button
          ref={builderRef}
          type="button"
          aria-label="New filter"
          aria-expanded={builder.open}
          aria-controls={builder.open ? builder.controls : undefined}
          disabled={disabled || saved.status !== 'success'}
          onClick={builder.onToggle}
          className={tabButton(builder.open)}
        >
          <PlusIcon aria-hidden="true" className="size-3.5" />
          Filter
        </button>
      </div>
      {saved.status === 'success' && saved.filters.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No saved filters yet</p>
      ) : null}
      {saved.status === 'error' ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-destructive">Couldn't load your saved filters.</span>
          <Button
            variant="outline"
            className="h-8 max-[760px]:h-11"
            disabled={saved.retrying}
            onClick={saved.onRetry}
          >
            {saved.retrying ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
