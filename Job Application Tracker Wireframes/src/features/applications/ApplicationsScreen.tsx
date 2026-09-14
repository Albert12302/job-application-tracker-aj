import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ALL_FILTER, noMatchesMessage } from '@/domain/filters';
import type { SavedFilter } from '@/domain/schemas';
import { FilterTabs } from '@/features/filters/FilterTabs';
import { SearchBox } from '@/features/filters/SearchBox';
import { useFilteredApplications } from '@/features/filters/use-filtered-applications';
import { NARROW, useMediaQuery } from '@/hooks/use-media-query';
import { errorReference } from '@/queries/errors';
import { useDeleteSavedFilter } from '@/queries/use-saved-filters';
import { AddApplicationLink } from './AddApplicationLink';
import { ApplicationCards } from './ApplicationCards';
import { ApplicationListSkeleton } from './ApplicationListSkeleton';
import { ApplicationTable } from './ApplicationTable';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { applicationCount } from './delete-summary';
import { SelectionBar } from './SelectionBar';
import { useSelection } from './use-selection';

const SHELL = 'overflow-hidden rounded-lg border bg-card';

/**
 * The dashboard (SPEC §4.2): search, the filter tabs, and the applications they
 * let through, newest first, as a table — or as cards below 760px (§11). Rows
 * can be ticked and deleted together (§9.2). Sort and pagination come with §6
 * step 6. The states are §8.2's: loading, error, no applications yet, and no
 * matches; the header and nav around this screen stay usable in all of them.
 */
export function ApplicationsScreen() {
  const view = useFilteredApplications();
  const { applications, url, visible } = view;
  const narrow = useMediaQuery(NARROW);
  const selection = useSelection(visible);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteFilter = useDeleteSavedFilter();
  const [filterNotice, setFilterNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const allTab = useRef<HTMLButtonElement>(null);

  // A change of filter or search clears the selection (§4.2), whatever made it —
  // a tab, typing, Clear filters, or the active saved filter being deleted.
  const viewKey = `${view.activeParam}\n${url.query}`;
  const [selectedIn, setSelectedIn] = useState(viewKey);
  if (viewKey !== selectedIn) {
    setSelectedIn(viewKey);
    selection.clear();
  }

  const removeFilter = (filter: SavedFilter) => {
    // Immediate, and the active one falls back to All (§9.5).
    if (view.activeParam === filter.id) url.replaceFilter(ALL_FILTER);
    deleteFilter.mutate(filter);
    setFilterNotice(`Deleted saved filter ${filter.name}.`);
    // Its × is gone; All is where a deleted active filter lands, so focus goes there too.
    allTab.current?.focus();
  };

  let content;
  if (applications.isPending || view.waiting) {
    content = (
      <div className={SHELL} aria-busy="true">
        <p role="status" className="sr-only">
          Loading your applications
        </p>
        <ApplicationListSkeleton narrow={narrow} />
      </div>
    );
  } else if (applications.isError) {
    content = (
      <div className={`${SHELL} p-5`}>
        <ErrorState title="Couldn't load your applications." reference={errorReference(applications.error)}>
          <Button
            className="h-9 max-[760px]:h-11"
            disabled={applications.isFetching}
            onClick={() => void applications.refetch()}
          >
            {applications.isFetching ? 'Retrying…' : 'Retry'}
          </Button>
        </ErrorState>
      </div>
    );
  } else if (view.all.length === 0) {
    // Nothing yet, whatever the filter says (§8.1): the way forward is adding one.
    content = (
      <div className={SHELL}>
        <EmptyState title="No applications yet" action={<AddApplicationLink />}>
          Add a job you've applied for and it will show up here.
        </EmptyState>
      </div>
    );
  } else if (visible.length === 0) {
    content = (
      <div className={SHELL}>
        <EmptyState
          title="No matches"
          action={
            <Button
              variant="outline"
              className="h-9 max-[760px]:h-11"
              onClick={() => {
                url.clear();
                // The button goes with the state it belongs to.
                heading.current?.focus();
              }}
            >
              Clear filters
            </Button>
          }
        >
          {noMatchesMessage(view.active, url.query)}
        </EmptyState>
      </div>
    );
  } else {
    content = (
      <>
        {selection.count > 0 ? (
          <SelectionBar
            count={selection.count}
            total={visible.length}
            narrow={narrow}
            onSelectAll={selection.selectAll}
            onClear={selection.clear}
            onDelete={() => setConfirmDelete(true)}
          />
        ) : null}
        <div className={SHELL}>
          {narrow ? (
            <ApplicationCards applications={visible} selection={selection} />
          ) : (
            <ApplicationTable applications={visible} selection={selection} />
          )}
        </div>
        <BulkDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          applications={selection.selected}
          onDeleted={(ids, finished) => {
            selection.remove(ids);
            // The bar and its Delete button are gone, so focus has nowhere to return to.
            if (finished) heading.current?.focus();
          }}
        />
      </>
    );
  }

  const ready = applications.isSuccess && !view.waiting;

  return (
    <section aria-labelledby="applications-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 max-[760px]:flex-col max-[760px]:items-stretch">
        <h1 ref={heading} id="applications-heading" tabIndex={-1} className="font-heading text-xl font-semibold outline-none">
          My Applications
        </h1>
        <div className="flex flex-wrap items-center gap-2.5 max-[760px]:flex-col max-[760px]:items-stretch">
          <SearchBox value={url.query} onChange={url.setQuery} disabled={!ready} />
          <AddApplicationLink className="max-[760px]:w-full" />
        </div>
      </div>
      <FilterTabs
        active={view.activeParam}
        counts={view.counts}
        saved={view.saved}
        disabled={!ready}
        allRef={allTab}
        onSelect={url.setFilter}
        onDelete={removeFilter}
      />
      {/* Always mounted, so each change is announced (§10.4): results after filtering, and the selection. */}
      <p role="status" className="sr-only">
        {ready && view.narrowed ? `Showing ${visible.length} of ${applicationCount(view.all.length)}.` : ''}
      </p>
      <p role="status" className="sr-only">
        {filterNotice}
      </p>
      <p role="status" className="sr-only">
        {selection.count > 0 ? `${selection.count} selected` : ''}
      </p>
      {content}
    </section>
  );
}
