import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { NARROW, useMediaQuery } from '@/hooks/use-media-query';
import { errorReference } from '@/queries/errors';
import { useApplications } from '@/queries/use-applications';
import { AddApplicationLink } from './AddApplicationLink';
import { ApplicationCards } from './ApplicationCards';
import { ApplicationListSkeleton } from './ApplicationListSkeleton';
import { ApplicationTable } from './ApplicationTable';

const SHELL = 'overflow-hidden rounded-lg border bg-card';

/**
 * The dashboard (SPEC §4.2): every application, newest first, as a table — or
 * as cards below 760px (§11). Search, filter tabs, sort, and pagination come
 * with §6 steps 5–6. The three states are §8.2's; the header and nav around
 * this screen stay usable in all of them.
 */
export function ApplicationsScreen() {
  const applications = useApplications();
  const narrow = useMediaQuery(NARROW);

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
  } else if (applications.data.length === 0) {
    content = (
      <div className={SHELL}>
        <EmptyState title="No applications yet" action={<AddApplicationLink />}>
          Add a job you've applied for and it will show up here.
        </EmptyState>
      </div>
    );
  } else {
    content = (
      <div className={SHELL}>
        {narrow ? (
          <ApplicationCards applications={applications.data} />
        ) : (
          <ApplicationTable applications={applications.data} />
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="applications-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 max-[760px]:flex-col max-[760px]:items-stretch">
        <h1 id="applications-heading" className="font-heading text-xl font-semibold">
          My Applications
        </h1>
        <AddApplicationLink className="max-[760px]:w-full" />
      </div>
      {content}
    </section>
  );
}
