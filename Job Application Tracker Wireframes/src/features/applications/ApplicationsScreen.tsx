import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import type { Application } from '@/domain/schemas';
import { NARROW, useMediaQuery } from '@/hooks/use-media-query';
import { errorReference } from '@/queries/errors';
import { useApplications } from '@/queries/use-applications';
import { AddApplicationLink } from './AddApplicationLink';
import { ApplicationCards } from './ApplicationCards';
import { ApplicationListSkeleton } from './ApplicationListSkeleton';
import { ApplicationTable } from './ApplicationTable';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { SelectionBar } from './SelectionBar';
import { useSelection } from './use-selection';

const SHELL = 'overflow-hidden rounded-lg border bg-card';
const NONE: Application[] = [];

/**
 * The dashboard (SPEC §4.2): every application, newest first, as a table — or
 * as cards below 760px (§11). Rows can be ticked and deleted together (§9.2).
 * Search, filter tabs, sort, and pagination come with §6 steps 5–6. The three
 * states are §8.2's; the header and nav around this screen stay usable in all
 * of them.
 */
export function ApplicationsScreen() {
  const applications = useApplications();
  const narrow = useMediaQuery(NARROW);
  const rows = applications.data ?? NONE;
  const selection = useSelection(rows);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  let content;
  if (applications.isPending) {
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
  } else if (rows.length === 0) {
    content = (
      <div className={SHELL}>
        <EmptyState title="No applications yet" action={<AddApplicationLink />}>
          Add a job you've applied for and it will show up here.
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
            <ApplicationCards applications={rows} selection={selection} />
          ) : (
            <ApplicationTable applications={rows} selection={selection} />
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

  return (
    <section aria-labelledby="applications-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 max-[760px]:flex-col max-[760px]:items-stretch">
        <h1 ref={heading} id="applications-heading" tabIndex={-1} className="font-heading text-xl font-semibold outline-none">
          My Applications
        </h1>
        <AddApplicationLink className="max-[760px]:w-full" />
      </div>
      {/* Always mounted, so a change of selection is announced (§10.4). */}
      <p role="status" className="sr-only">
        {selection.count > 0 ? `${selection.count} selected` : ''}
      </p>
      {content}
    </section>
  );
}
