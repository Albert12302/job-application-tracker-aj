import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ALL_FILTER, noMatchesMessage } from '@/domain/filters';
import { uniqueLocations } from '@/domain/location';
import { sortLabel } from '@/domain/order';
import { spokenRange } from '@/domain/pagination';
import type { SavedFilter } from '@/domain/schemas';
import { FilterBuilder } from '@/features/filters/FilterBuilder';
import { FilterTabs } from '@/features/filters/FilterTabs';
import { SearchBox } from '@/features/filters/SearchBox';
import { useFilteredApplications } from '@/features/filters/use-filtered-applications';
import { scrollBehavior } from '@/hooks/prefers-reduced-motion';
import { NARROW, useMediaQuery } from '@/hooks/use-media-query';
import { errorReference } from '@/queries/errors';
import { useCreateSavedFilter, useDeleteSavedFilter } from '@/queries/use-saved-filters';
import { AddApplicationLink } from './AddApplicationLink';
import { ApplicationCards } from './ApplicationCards';
import { ApplicationListSkeleton } from './ApplicationListSkeleton';
import { ApplicationPagination } from './ApplicationPagination';
import { ApplicationTable } from './ApplicationTable';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { applicationCount } from './delete-summary';
import { JumpToBottom } from './JumpToBottom';
import { useRememberListSearch } from './list-return';
import { SelectionBar } from './SelectionBar';
import { SortToggle } from './SortToggle';
import { useSelection } from './use-selection';

const SHELL = 'overflow-hidden rounded-lg border bg-card';

/**
 * The dashboard (SPEC §4.2): search, the filter tabs, and a page of the
 * applications they let through, in date order, as a table — or as cards below
 * 760px (§11) — with the pagination below and Jump to bottom floating over it.
 * Rows on the page can be ticked and deleted together (§9.2). The states are
 * §8.2's: loading, error, no applications yet, and no matches; the header and
 * nav around this screen stay usable in all of them.
 */
export function ApplicationsScreen() {
  const view = useFilteredApplications();
  const { applications, url, matched, rows, paging } = view;
  const narrow = useMediaQuery(NARROW);
  const selection = useSelection(rows);
  useRememberListSearch(url.search);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteFilter = useDeleteSavedFilter();
  // Here rather than in the builder, so a save finishes what it started even if the panel has gone.
  const createFilter = useCreateSavedFilter();
  const [filterNotice, setFilterNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const allTab = useRef<HTMLButtonElement>(null);
  const builderToggle = useRef<HTMLButtonElement>(null);
  const [building, setBuilding] = useState(false);
  const builderId = useId();
  const pageStart = useRef<HTMLElement | null>(null);
  const pagination = useRef<HTMLDivElement>(null);
  const followedPageLink = useRef(false);
  const ready = applications.isSuccess && !view.waiting;

  // A change of filter, search, order, page, or page size clears the selection (§4.2),
  // whatever made it — a tab, typing, Clear filters, the active saved filter being deleted,
  // or the last rows of the last page going. Only rows on screen can be selected.
  const viewKey = [view.activeParam, url.query, url.sort, paging.page, url.pageSize].join('\n');
  const [selectedIn, setSelectedIn] = useState(viewKey);
  if (viewKey !== selectedIn) {
    setSelectedIn(viewKey);
    selection.clear();
  }

  // A page past the end — a stale link, or the rows of the last page deleted — shows the
  // last page; the URL follows, so a reload or a copied link agrees with the screen.
  useEffect(() => {
    if (ready && url.page !== paging.page) url.correctPage(paging.page);
  }, [ready, url, paging.page]);

  // After Previous, Next, or a number, the new page is read from its start: the view goes
  // to the top of the list and focus to the list, whose name says which page it is.
  useEffect(() => {
    if (!followedPageLink.current) return;
    followedPageLink.current = false;
    pageStart.current?.scrollIntoView?.({ block: 'start', behavior: scrollBehavior() });
    pageStart.current?.focus({ preventScroll: true });
  }, [paging.page]);

  const toggleSort = () => {
    setFilterNotice(`Sorted ${sortLabel(url.sort === 'date-asc' ? 'date-desc' : 'date-asc').toLowerCase()}.`);
    url.toggleSort();
  };

  const listName = `Your applications, ${sortLabel(url.sort).toLowerCase()}${
    paging.pageCount > 1 ? `, page ${paging.page} of ${paging.pageCount}` : ''
  }`;

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
        <ApplicationListSkeleton narrow={narrow} sort={url.sort} />
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
  } else if (matched.length === 0) {
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
            total={rows.length}
            narrow={narrow}
            onSelectAll={selection.selectAll}
            onClear={selection.clear}
            onDelete={() => setConfirmDelete(true)}
          />
        ) : null}
        <div className={SHELL}>
          {narrow ? (
            <ApplicationCards
              ref={(element) => {
                pageStart.current = element;
              }}
              applications={rows}
              selection={selection}
              label={listName}
            />
          ) : (
            <ApplicationTable
              ref={(element) => {
                pageStart.current = element;
              }}
              applications={rows}
              selection={selection}
              sort={url.sort}
              onSort={toggleSort}
              caption={listName}
            />
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

  // Sort and pagination show while loading, disabled (§8.2), and with rows; not in a state with none.
  const loading = applications.isPending || view.waiting;
  const listed = loading || (applications.isSuccess && matched.length > 0);

  let summary = '';
  if (ready && matched.length > 0) {
    if (paging.pageCount > 1) summary = `Showing ${spokenRange(paging)} applications.`;
    else if (view.narrowed) summary = `Showing ${matched.length} of ${applicationCount(view.all.length)}.`;
  }

  return (
    // Bottom room so the floating Jump to bottom never covers the last of the list (§11).
    <section aria-labelledby="applications-heading" className="flex flex-col gap-4 pb-12 max-[760px]:pb-20">
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
        builder={{
          open: building,
          saving: createFilter.isPending,
          controls: builderId,
          onToggle: () => {
            // A failure shown last time is not news on a fresh panel.
            if (!building) createFilter.reset();
            setBuilding((open) => !open);
          },
        }}
        builderRef={builderToggle}
        onSelect={url.setFilter}
        onDelete={removeFilter}
      />
      {building && view.saved.status === 'success' ? (
        <FilterBuilder
          id={builderId}
          locations={uniqueLocations(view.all)}
          existingNames={view.saved.filters.map((filter) => filter.name)}
          pending={createFilter.isPending}
          error={createFilter.error}
          onSave={(values) =>
            createFilter.mutate(values, {
              onSuccess: (filter) => {
                setBuilding(false);
                url.setFilter(filter.id);
                setFilterNotice(`Saved filter ${filter.name}.`);
                builderToggle.current?.focus();
              },
            })
          }
          onCancel={() => {
            setBuilding(false);
            builderToggle.current?.focus();
          }}
        />
      ) : null}
      {/* Always mounted, so each change is announced (§10.4): the rows shown after a change of
          filter, search, page, or page size; saved filters and the order; and the selection. */}
      <p role="status" className="sr-only">
        {summary}
      </p>
      <p role="status" className="sr-only">
        {filterNotice}
      </p>
      <p role="status" className="sr-only">
        {selection.count > 0 ? `${selection.count} selected` : ''}
      </p>
      {narrow && listed ? <SortToggle sort={url.sort} onToggle={toggleSort} disabled={!ready} /> : null}
      {content}
      {listed ? (
        <>
          <JumpToBottom target={pagination} />
          <ApplicationPagination
            ref={pagination}
            paging={ready ? paging : null}
            pageSize={url.pageSize}
            narrow={narrow}
            linkSearch={url.pageSearch}
            onPageSize={url.setPageSize}
            onPageLink={(target) => {
              if (target !== paging.page) followedPageLink.current = true;
            }}
          />
        </>
      ) : null}
    </section>
  );
}
